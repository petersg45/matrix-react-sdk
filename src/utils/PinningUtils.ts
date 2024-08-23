/*
Copyright 2017 Travis Ralston

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

import { MatrixEvent, EventType, M_POLL_START, MatrixClient, EventTimeline } from "matrix-js-sdk/src/matrix";

import { isContentActionable } from "./EventUtils";
import SettingsStore from "../settings/SettingsStore";
import { ReadPinsEventId } from "../components/views/right_panel/types";

export default class PinningUtils {
    /**
     * Event types that may be pinned.
     */
    public static readonly PINNABLE_EVENT_TYPES: (EventType | string)[] = [
        EventType.RoomMessage,
        M_POLL_START.name,
        M_POLL_START.altName,
    ];

    /**
     * Determines if the given event can be pinned.
     * This is a simple check to see if the event is of a type that can be pinned.
     * @param {MatrixEvent} event The event to check.
     * @return {boolean} True if the event may be pinned, false otherwise.
     */
    public static isPinnable(event: MatrixEvent): boolean {
        if (event.isRedacted()) return false;
        return PinningUtils.isUnpinnable(event);
    }

    /**
     * Determines if the given event may be unpinned.
     * @param {MatrixEvent} event The event to check.
     * @return {boolean} True if the event may be unpinned, false otherwise.
     */
    public static isUnpinnable(event: MatrixEvent): boolean {
        if (!event) return false;
        if (event.isRedacted()) return true;
        return this.PINNABLE_EVENT_TYPES.includes(event.getType());
    }

    /**
     * Determines if the given event is pinned.
     * @param matrixClient
     * @param mxEvent
     */
    public static isPinned(matrixClient: MatrixClient, mxEvent: MatrixEvent): boolean {
        const room = matrixClient.getRoom(mxEvent.getRoomId());
        if (!room) return false;

        const pinnedEvent = room
            .getLiveTimeline()
            .getState(EventTimeline.FORWARDS)
            ?.getStateEvents(EventType.RoomPinnedEvents, "");
        if (!pinnedEvent) return false;
        const content = pinnedEvent.getContent();
        return content.pinned && Array.isArray(content.pinned) && content.pinned.includes(mxEvent.getId());
    }

    /**
     * Determines if the given event may be pinned or unpinned by the current user.
     * This checks if the user has the necessary permissions to pin or unpin the event, and if the event is pinnable.
     * @param matrixClient
     * @param mxEvent
     */
    public static canPinOrUnpin(matrixClient: MatrixClient, mxEvent: MatrixEvent): boolean {
        if (!SettingsStore.getValue("feature_pinning")) return false;
        if (!isContentActionable(mxEvent)) return false;

        const room = matrixClient.getRoom(mxEvent.getRoomId());
        if (!room) return false;

        return Boolean(
            room
                .getLiveTimeline()
                .getState(EventTimeline.FORWARDS)
                ?.mayClientSendStateEvent(EventType.RoomPinnedEvents, matrixClient) && PinningUtils.isPinnable(mxEvent),
        );
    }

    /**
     * Pin or unpin the given event.
     * @param matrixClient
     * @param mxEvent
     */
    public static async pinOrUnpinEvent(matrixClient: MatrixClient, mxEvent: MatrixEvent): Promise<void> {
        const room = matrixClient.getRoom(mxEvent.getRoomId());
        if (!room) return;

        const eventId = mxEvent.getId();
        if (!eventId) return;

        // Get the current pinned events of the room
        const pinnedIds: Array<string> =
            room
                .getLiveTimeline()
                .getState(EventTimeline.FORWARDS)
                ?.getStateEvents(EventType.RoomPinnedEvents, "")
                ?.getContent().pinned || [];

        let roomAccountDataPromise: Promise<{} | void> = Promise.resolve();
        // If the event is already pinned, unpin it
        if (pinnedIds.includes(eventId)) {
            pinnedIds.splice(pinnedIds.indexOf(eventId), 1);
        } else {
            // Otherwise, pin it
            pinnedIds.push(eventId);
            // We don't want to wait for the roomAccountDataPromise to resolve before sending the state event
            roomAccountDataPromise = matrixClient.setRoomAccountData(room.roomId, ReadPinsEventId, {
                event_ids: [...(room.getAccountData(ReadPinsEventId)?.getContent()?.event_ids || []), eventId],
            });
        }
        await Promise.all([
            matrixClient.sendStateEvent(room.roomId, EventType.RoomPinnedEvents, { pinned: pinnedIds }, ""),
            roomAccountDataPromise,
        ]);
    }
}
