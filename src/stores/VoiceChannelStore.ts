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

import { EventEmitter } from "events";
import { logger } from "matrix-js-sdk/src/logger";
import { ClientWidgetApi, IWidgetApiRequest } from "matrix-widget-api";

import { MatrixClientPeg } from "../MatrixClientPeg";
import { ElementWidgetActions } from "./widgets/ElementWidgetActions";
import { WidgetMessagingStore } from "./widgets/WidgetMessagingStore";
import {
    VOICE_CHANNEL_MEMBER,
    IVoiceChannelMemberContent,
    getVoiceChannel,
} from "../utils/VoiceChannelUtils";
import { timeout } from "../utils/promise";
import WidgetUtils from "../utils/WidgetUtils";

export enum VoiceChannelEvent {
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
 * Holds information about the currently active voice channel.
 */
export default class VoiceChannelStore extends EventEmitter {
    private static _instance: VoiceChannelStore;
    private static readonly TIMEOUT = 8000;

    public static get instance(): VoiceChannelStore {
        if (!VoiceChannelStore._instance) {
            VoiceChannelStore._instance = new VoiceChannelStore();
        }
        return VoiceChannelStore._instance;
    }

    private readonly cli = MatrixClientPeg.get();
    private activeChannel: ClientWidgetApi;
    private _roomId: string;
    private _participants: IJitsiParticipant[];

    public get roomId(): string {
        return this._roomId;
    }

    public get participants(): IJitsiParticipant[] {
        return this._participants;
    }

    public connect = async (roomId: string) => {
        if (this.activeChannel) await this.disconnect();

        const jitsi = getVoiceChannel(roomId);
        if (!jitsi) throw new Error(`No voice channel in room ${roomId}`);

        const messaging = WidgetMessagingStore.instance.getMessagingForUid(WidgetUtils.getWidgetUid(jitsi));
        if (!messaging) throw new Error(`Failed to bind voice channel in room ${roomId}`);

        this.activeChannel = messaging;
        this._roomId = roomId;

        // Participant data will come down the event pipeline very quickly, so prepare in advance
        messaging.on(`action:${ElementWidgetActions.CallParticipants}`, this.onParticipants);

        // Actually perform the join
        const waitForJoin = this.waitForAction(ElementWidgetActions.JoinCall);
        messaging.transport.send(ElementWidgetActions.JoinCall, {});
        try {
            await waitForJoin;
        } catch (e) {
            // If it timed out, clean up our advance preparations
            this.activeChannel = null;
            this._roomId = null;

            messaging.off(`action:${ElementWidgetActions.CallParticipants}`, this.onParticipants);

            throw e;
        }

        messaging.once(`action:${ElementWidgetActions.HangupCall}`, this.onHangup);

        this.emit(VoiceChannelEvent.Connect);

        // Tell others that we're connected, by adding our device to room state
        await this.updateDevices(devices => Array.from(new Set(devices).add(this.cli.getDeviceId())));
    };

    public disconnect = async () => {
        if (!this.activeChannel) throw new Error("Not connected to any voice channel");

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
        if (await timeout(wait, false, VoiceChannelStore.TIMEOUT) === false) {
            throw new Error("Communication with voice channel timed out");
        }
    };

    private ack = (ev: CustomEvent<IWidgetApiRequest>) => {
        this.activeChannel.transport.reply(ev.detail, {});
    };

    private updateDevices = async (fn: (devices: string[]) => string[]) => {
        if (!this.roomId) {
            logger.error("Tried to update devices while disconnected");
            return;
        }

        const devices = this.cli.getRoom(this.roomId)
            .currentState.getStateEvents(VOICE_CHANNEL_MEMBER, this.cli.getUserId())
            ?.getContent<IVoiceChannelMemberContent>()?.devices ?? [];

        await this.cli.sendStateEvent(
            this.roomId, VOICE_CHANNEL_MEMBER, { devices: fn(devices) }, this.cli.getUserId(),
        );
    };

    private onHangup = async (ev: CustomEvent<IWidgetApiRequest>) => {
        this.ack(ev);

        this.activeChannel.off(`action:${ElementWidgetActions.CallParticipants}`, this.onParticipants);

        this.activeChannel = null;
        this._participants = null;

        try {
            // Tell others that we're disconnected, by removing our device from room state
            await this.updateDevices(devices => {
                const devicesSet = new Set(devices);
                devicesSet.delete(this.cli.getDeviceId());
                return Array.from(devicesSet);
            });
        } finally {
            // Save this for last, since updateDevices needs the room ID
            this._roomId = null;
            this.emit(VoiceChannelEvent.Disconnect);
        }
    };

    private onParticipants = (ev: CustomEvent<IWidgetApiRequest>) => {
        this._participants = ev.detail.data.participants as IJitsiParticipant[];
        this.emit(VoiceChannelEvent.Participants, ev.detail.data.participants);
        this.ack(ev);
    };
}
