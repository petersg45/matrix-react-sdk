/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { ClientWidgetApi, IWidgetApiRequest } from "matrix-widget-api";

import defaultDispatcher from "../dispatcher/dispatcher";
import { ActionPayload } from "../dispatcher/payloads";
import { ElementWidgetActions } from "./widgets/ElementWidgetActions";
import { WidgetMessagingStore, WidgetMessagingStoreEvent } from "./widgets/WidgetMessagingStore";
import {
    VIDEO_CHANNEL_MEMBER,
    IVideoChannelMemberContent,
    getVideoChannel,
} from "../utils/VideoChannelUtils";
import { timeout } from "../utils/promise";
import WidgetUtils from "../utils/WidgetUtils";
import { AsyncStoreWithClient } from "./AsyncStoreWithClient";

export enum VideoChannelEvent {
    StartConnect = "start_connect",
    Connect = "connect",
    Disconnect = "disconnect",
    Participants = "participants",
}

export interface IJitsiParticipant {
    avatarURL: string;
    displayName: string;
    formattedDisplayName: string;
    participantId: string;
}

/*
 * Holds information about the currently active video channel.
 */
export default class VideoChannelStore extends AsyncStoreWithClient<null> {
    private static _instance: VideoChannelStore;
    private static readonly TIMEOUT_MS = 8000;

    public static get instance(): VideoChannelStore {
        if (!VideoChannelStore._instance) {
            VideoChannelStore._instance = new VideoChannelStore();
        }
        return VideoChannelStore._instance;
    }

    private constructor() {
        super(defaultDispatcher);
    }

    protected async onAction(payload: ActionPayload): Promise<void> {
        // nothing to do
    }

    private activeChannel: ClientWidgetApi;

    private _roomId: string;
    public get roomId(): string { return this._roomId; }
    private set roomId(value: string) { this._roomId = value; }

    private _connected = false;
    public get connected(): boolean { return this._connected; }
    private set connected(value: boolean) { this._connected = value; }

    private _participants: IJitsiParticipant[] = [];
    public get participants(): IJitsiParticipant[] { return this._participants; }
    private set participants(value: IJitsiParticipant[]) { this._participants = value; }

    public connect = async (roomId: string, audioDevice: MediaDeviceInfo, videoDevice: MediaDeviceInfo) => {
        if (this.activeChannel) await this.disconnect();

        const jitsi = getVideoChannel(roomId);
        if (!jitsi) throw new Error(`No video channel in room ${roomId}`);

        const jitsiUid = WidgetUtils.getWidgetUid(jitsi);
        const messagingStore = WidgetMessagingStore.instance;

        let messaging = messagingStore.getMessagingForUid(jitsiUid);
        if (!messaging) {
            // The widget might still be initializing, so wait for it
            let messagingListener;
            const getMessaging = new Promise<void>(resolve => {
                messagingListener = (uid: string, widgetApi: ClientWidgetApi) => {
                    if (uid === jitsiUid) {
                        messaging = widgetApi;
                        resolve();
                    }
                };
                messagingStore.on(WidgetMessagingStoreEvent.StoreMessaging, messagingListener);
            });

            const timedOut = await timeout(getMessaging, false, VideoChannelStore.TIMEOUT_MS) === false;
            messagingStore.off(WidgetMessagingStoreEvent.StoreMessaging, messagingListener);
            if (timedOut) throw new Error(`Failed to bind video channel in room ${roomId}`);
        }

        if (!messagingStore.isWidgetReady(jitsiUid)) {
            // Wait for the widget to be ready to receive our join event
            let readyListener;
            const ready = new Promise<void>(resolve => {
                readyListener = (uid: string) => {
                    if (uid === jitsiUid) resolve();
                };
                messagingStore.on(WidgetMessagingStoreEvent.WidgetReady, readyListener);
            });

            const timedOut = await timeout(ready, false, VideoChannelStore.TIMEOUT_MS) === false;
            messagingStore.off(WidgetMessagingStoreEvent.WidgetReady, readyListener);
            if (timedOut) throw new Error(`Video channel in room ${roomId} never became ready`);
        }

        this.activeChannel = messaging;
        this.roomId = roomId;
        // Participant data will come down the event pipeline quickly, so prepare in advance
        messaging.on(`action:${ElementWidgetActions.CallParticipants}`, this.onParticipants);

        this.emit(VideoChannelEvent.StartConnect, roomId);

        // Actually perform the join
        const waitForJoin = this.waitForAction(ElementWidgetActions.JoinCall);
        messaging.transport.send(ElementWidgetActions.JoinCall, {
            audioDevice: audioDevice?.label,
            videoDevice: videoDevice?.label,
        });
        try {
            await waitForJoin;
        } catch (e) {
            // If it timed out, clean up our advance preparations
            this.activeChannel = null;
            this.roomId = null;
            messaging.off(`action:${ElementWidgetActions.CallParticipants}`, this.onParticipants);

            this.emit(VideoChannelEvent.Disconnect, roomId);

            throw e;
        }

        this.connected = true;
        messaging.once(`action:${ElementWidgetActions.HangupCall}`, this.onHangup);

        this.emit(VideoChannelEvent.Connect, roomId);

        // Tell others that we're connected, by adding our device to room state
        this.updateDevices(roomId, devices => Array.from(new Set(devices).add(this.matrixClient.getDeviceId())));
    };

    public disconnect = async () => {
        if (!this.activeChannel) throw new Error("Not connected to any video channel");

        const waitForHangup = this.waitForAction(ElementWidgetActions.HangupCall);
        this.activeChannel.transport.send(ElementWidgetActions.HangupCall, {});
        await waitForHangup;

        // onHangup cleans up for us
    };

    private waitForAction = async (action: ElementWidgetActions) => {
        const wait = new Promise<void>(resolve =>
            this.activeChannel.once(`action:${action}`, (ev: CustomEvent<IWidgetApiRequest>) => {
                this.ack(ev);
                resolve();
            }),
        );
        if (await timeout(wait, false, VideoChannelStore.TIMEOUT_MS) === false) {
            throw new Error("Communication with video channel timed out");
        }
    };

    private ack = (ev: CustomEvent<IWidgetApiRequest>) => {
        // Even if we don't have a reply to a given widget action, we still need
        // to give the widget API something to acknowledge receipt
        this.activeChannel.transport.reply(ev.detail, {});
    };

    private updateDevices = async (roomId: string, fn: (devices: string[]) => string[]) => {
        const room = this.matrixClient.getRoom(roomId);
        const devicesState = room.currentState.getStateEvents(VIDEO_CHANNEL_MEMBER, this.matrixClient.getUserId());
        const devices = devicesState?.getContent<IVideoChannelMemberContent>()?.devices ?? [];

        await this.matrixClient.sendStateEvent(
            roomId, VIDEO_CHANNEL_MEMBER, { devices: fn(devices) }, this.matrixClient.getUserId(),
        );
    };

    private onHangup = async (ev: CustomEvent<IWidgetApiRequest>) => {
        this.ack(ev);

        this.activeChannel.off(`action:${ElementWidgetActions.HangupCall}`, this.onHangup);
        this.activeChannel.off(`action:${ElementWidgetActions.CallParticipants}`, this.onParticipants);

        const roomId = this.roomId;
        this.activeChannel = null;
        this.roomId = null;
        this.connected = false;
        this.participants = [];

        this.emit(VideoChannelEvent.Disconnect, roomId);

        // Tell others that we're disconnected, by removing our device from room state
        await this.updateDevices(roomId, devices => {
            const devicesSet = new Set(devices);
            devicesSet.delete(this.matrixClient.getDeviceId());
            return Array.from(devicesSet);
        });
    };

    private onParticipants = (ev: CustomEvent<IWidgetApiRequest>) => {
        this.participants = ev.detail.data.participants as IJitsiParticipant[];
        this.emit(VideoChannelEvent.Participants, this.roomId, ev.detail.data.participants);
        this.ack(ev);
    };
}
