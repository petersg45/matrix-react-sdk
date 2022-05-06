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

import EventEmitter from "events";
import { Room, RoomEvent } from "matrix-js-sdk/src/models/room";
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

const TIMEOUT_MS = 16000;

// Wait until an event is emitted satisfying the given predicate
const waitForEvent = async (emitter: EventEmitter, event: string, pred: (...args) => boolean = () => true) => {
    let listener;
    const wait = new Promise<void>(resolve => {
        listener = (...args) => { if (pred(...args)) resolve(); };
        emitter.on(event, listener);
    });

    const timedOut = await timeout(wait, false, TIMEOUT_MS) === false;
    emitter.off(event, listener);
    if (timedOut) throw new Error("Timed out");
};

/*
 * Holds information about the currently active video channel.
 */
export default class VideoChannelStore extends AsyncStoreWithClient<null> {
    private static _instance: VideoChannelStore;

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

    private _audioMuted = localStorage.getItem("mx_audioMuted") === "true";
    public get audioMuted(): boolean { return this._audioMuted; }
    public set audioMuted(value: boolean) {
        this._audioMuted = value;
        localStorage.setItem("mx_audioMuted", value.toString());
    }

    private _videoMuted = localStorage.getItem("mx_videoMuted") === "true";
    public get videoMuted(): boolean { return this._videoMuted; }
    public set videoMuted(value: boolean) {
        this._videoMuted = value;
        localStorage.setItem("mx_videoMuted", value.toString());
    }

    public connect = async (roomId: string, audioDevice: MediaDeviceInfo, videoDevice: MediaDeviceInfo) => {
        if (this.activeChannel) await this.disconnect();

        const jitsi = getVideoChannel(roomId);
        if (!jitsi) throw new Error(`No video channel in room ${roomId}`);

        const jitsiUid = WidgetUtils.getWidgetUid(jitsi);
        const messagingStore = WidgetMessagingStore.instance;

        let messaging = messagingStore.getMessagingForUid(jitsiUid);
        if (!messaging) {
            // The widget might still be initializing, so wait for it
            try {
                await waitForEvent(
                    messagingStore,
                    WidgetMessagingStoreEvent.StoreMessaging,
                    (uid: string, widgetApi: ClientWidgetApi) => {
                        if (uid === jitsiUid) {
                            messaging = widgetApi;
                            return true;
                        }
                        return false;
                    },
                );
            } catch (e) {
                throw new Error(`Failed to bind video channel in room ${roomId}: ${e}`);
            }
        }

        if (!messagingStore.isWidgetReady(jitsiUid)) {
            // Wait for the widget to be ready to receive our join event
            try {
                await waitForEvent(
                    messagingStore,
                    WidgetMessagingStoreEvent.WidgetReady,
                    (uid: string) => uid === jitsiUid,
                );
            } catch (e) {
                throw new Error(`Video channel in room ${roomId} never became ready: ${e}`);
            }
        }

        // Participant data and mute state will come down the event pipeline quickly, so prepare in advance
        this.activeChannel = messaging;
        this.roomId = roomId;
        messaging.on(`action:${ElementWidgetActions.CallParticipants}`, this.onParticipants);
        messaging.on(`action:${ElementWidgetActions.MuteAudio}`, this.onMuteAudio);
        messaging.on(`action:${ElementWidgetActions.UnmuteAudio}`, this.onUnmuteAudio);
        messaging.on(`action:${ElementWidgetActions.MuteVideo}`, this.onMuteVideo);
        messaging.on(`action:${ElementWidgetActions.UnmuteVideo}`, this.onUnmuteVideo);

        this.emit(VideoChannelEvent.StartConnect, roomId);

        // Actually perform the join
        const waitForJoin = waitForEvent(
            messaging,
            `action:${ElementWidgetActions.JoinCall}`,
            (ev: CustomEvent<IWidgetApiRequest>) => {
                this.ack(ev);
                return true;
            },
        );
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
            messaging.off(`action:${ElementWidgetActions.MuteAudio}`, this.onMuteAudio);
            messaging.off(`action:${ElementWidgetActions.UnmuteAudio}`, this.onUnmuteAudio);
            messaging.off(`action:${ElementWidgetActions.MuteVideo}`, this.onMuteVideo);
            messaging.off(`action:${ElementWidgetActions.UnmuteVideo}`, this.onUnmuteVideo);

            this.emit(VideoChannelEvent.Disconnect, roomId);

            throw new Error(`Failed to join call in room ${roomId}: ${e}`);
        }

        this.connected = true;
        messaging.once(`action:${ElementWidgetActions.HangupCall}`, this.onHangup);
        this.matrixClient.getRoom(roomId).on(RoomEvent.MyMembership, this.onMyMembership);
        window.addEventListener("beforeunload", this.setDisconnected);

        this.emit(VideoChannelEvent.Connect, roomId);

        // Tell others that we're connected, by adding our device to room state
        this.updateDevices(roomId, devices => Array.from(new Set(devices).add(this.matrixClient.getDeviceId())));
    };

    public disconnect = async () => {
        if (!this.activeChannel) throw new Error("Not connected to any video channel");

        const waitForDisconnect = waitForEvent(this, VideoChannelEvent.Disconnect);
        this.activeChannel.transport.send(ElementWidgetActions.HangupCall, {});
        try {
            await waitForDisconnect; // onHangup cleans up for us
        } catch (e) {
            throw new Error(`Failed to hangup call in room ${this.roomId}: ${e}`);
        }
    };

    public setDisconnected = async () => {
        const roomId = this.roomId;

        this.activeChannel.off(`action:${ElementWidgetActions.HangupCall}`, this.onHangup);
        this.activeChannel.off(`action:${ElementWidgetActions.CallParticipants}`, this.onParticipants);
        this.matrixClient.getRoom(roomId).off(RoomEvent.MyMembership, this.onMyMembership);
        window.removeEventListener("beforeunload", this.setDisconnected);

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

    private ack = (ev: CustomEvent<IWidgetApiRequest>) => {
        // Even if we don't have a reply to a given widget action, we still need
        // to give the widget API something to acknowledge receipt
        this.activeChannel.transport.reply(ev.detail, {});
    };

    private updateDevices = async (roomId: string, fn: (devices: string[]) => string[]) => {
        const room = this.matrixClient.getRoom(roomId);
        if (room.getMyMembership() !== "join") return;

        const devicesState = room.currentState.getStateEvents(VIDEO_CHANNEL_MEMBER, this.matrixClient.getUserId());
        const devices = devicesState?.getContent<IVideoChannelMemberContent>()?.devices ?? [];

        await this.matrixClient.sendStateEvent(
            roomId, VIDEO_CHANNEL_MEMBER, { devices: fn(devices) }, this.matrixClient.getUserId(),
        );
    };

    private onHangup = async (ev: CustomEvent<IWidgetApiRequest>) => {
        this.ack(ev);
        await this.setDisconnected();
    };

    private onParticipants = (ev: CustomEvent<IWidgetApiRequest>) => {
        this.participants = ev.detail.data.participants as IJitsiParticipant[];
        this.emit(VideoChannelEvent.Participants, this.roomId, ev.detail.data.participants);
        this.ack(ev);
    };

    private onMuteAudio = (ev: CustomEvent<IWidgetApiRequest>) => {
        this.audioMuted = true;
        this.ack(ev);
    };

    private onUnmuteAudio = (ev: CustomEvent<IWidgetApiRequest>) => {
        this.audioMuted = false;
        this.ack(ev);
    };

    private onMuteVideo = (ev: CustomEvent<IWidgetApiRequest>) => {
        this.videoMuted = true;
        this.ack(ev);
    };

    private onUnmuteVideo = (ev: CustomEvent<IWidgetApiRequest>) => {
        this.videoMuted = false;
        this.ack(ev);
    };

    private onMyMembership = (room: Room, membership: string) => {
        if (membership !== "join") this.setDisconnected();
    };
}
