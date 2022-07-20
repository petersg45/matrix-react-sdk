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

import { logger } from "matrix-js-sdk/src/logger";
import { ClientEvent, EventType, MatrixClient } from "matrix-js-sdk/src/matrix";

import defaultDispatcher from "../dispatcher/dispatcher";
import { MatrixClientPeg } from "../MatrixClientPeg";
import { LocalRoom, LocalRoomState } from "../models/LocalRoom";
import * as thisModule from "./local-room";
import { isLocalRoom } from "./localRoom/isLocalRoom";

/**
 * Does a room action:
 * For non-local rooms it calls fn directly.
 * For local rooms it adds the callback function to the room's afterCreateCallbacks and
 * dispatches a "local_room_event".
 *
 * @async
 * @template T
 * @param {string} roomId Room ID of the target room
 * @param {(actualRoomId: string) => Promise<T>} fn Callback to be called directly or collected at the local room
 * @param {MatrixClient} [client]
 * @returns {Promise<T>} Promise that gets resolved after the callback has finished
 */
export async function doMaybeLocalRoomAction<T>(
    roomId: string,
    fn: (actualRoomId: string) => Promise<T>,
    client?: MatrixClient,
): Promise<T> {
    if (isLocalRoom(roomId)) {
        client = client ?? MatrixClientPeg.get();
        const room = client.getRoom(roomId) as LocalRoom;

        if (room.isCreated) {
            return fn(room.actualRoomId);
        }

        return new Promise<T>((resolve, reject) => {
            room.afterCreateCallbacks.push((newRoomId: string) => {
                fn(newRoomId).then(resolve).catch(reject);
            });
            defaultDispatcher.dispatch({
                action: "local_room_event",
                roomId: room.roomId,
            });
        });
    }

    return fn(roomId);
}

/**
 * Tests whether a room created based on a local room is ready.
 */
export function isRoomReady(
    client: MatrixClient,
    localRoom: LocalRoom,
): boolean {
    // not ready if no actual room id exists
    if (!localRoom.actualRoomId) return false;

    const room = client.getRoom(localRoom.actualRoomId);
    // not ready if the room does not exist
    if (!room) return false;

    // not ready if not all members joined/invited
    if (room.getInvitedAndJoinedMemberCount() !== 1 + localRoom.targets?.length) return false;

    const roomHistoryVisibilityEvents = room.currentState.getStateEvents(EventType.RoomHistoryVisibility);
    // not ready if the room history has not been configured
    if (roomHistoryVisibilityEvents.length === 0) return false;

    const roomEncryptionEvents = room.currentState.getStateEvents(EventType.RoomEncryption);
    // not ready if encryption has not been configured (applies only to encrypted rooms)
    if (localRoom.encrypted === true && roomEncryptionEvents.length === 0) return false;

    return true;
}

/**
 * Waits until a room is ready and then applies the after-create local room callbacks.
 * Also implements a stopgap timeout after that a room is assumed to be ready.
 *
 * @see isRoomReady
 * @async
 * @param {MatrixClient} client
 * @param {LocalRoom} localRoom
 * @returns {Promise<string>} Resolved to the actual room id
 */
export async function waitForRoomReadyAndApplyAfterCreateCallbacks(
    client: MatrixClient,
    localRoom: LocalRoom,
): Promise<string> {
    if (thisModule.isRoomReady(client, localRoom)) {
        return applyAfterCreateCallbacks(localRoom, localRoom.actualRoomId).then(() => {
            localRoom.state = LocalRoomState.CREATED;
            client.emit(ClientEvent.Room, localRoom);
            return Promise.resolve(localRoom.actualRoomId);
        });
    }

    return new Promise((resolve) => {
        const finish = () => {
            if (checkRoomStateIntervalHandle) clearInterval(checkRoomStateIntervalHandle);
            if (stopgapTimeoutHandle) clearTimeout(stopgapTimeoutHandle);

            applyAfterCreateCallbacks(localRoom, localRoom.actualRoomId).then(() => {
                localRoom.state = LocalRoomState.CREATED;
                client.emit(ClientEvent.Room, localRoom);
                resolve(localRoom.actualRoomId);
            });
        };

        const stopgapFinish = () => {
            logger.warn(`Assuming local room ${localRoom.roomId} is ready after hitting timeout`);
            finish();
        };

        const checkRoomStateIntervalHandle = setInterval(() => {
            if (thisModule.isRoomReady(client, localRoom)) finish();
        }, 500);
        const stopgapTimeoutHandle = setTimeout(stopgapFinish, 5000);
    });
}

/**
 * Applies the after-create callback of a local room.
 *
 * @async
 * @param {LocalRoom} localRoom
 * @param {string} roomId
 * @returns {Promise<void>} Resolved after all callbacks have been called
 */
async function applyAfterCreateCallbacks(localRoom: LocalRoom, roomId: string): Promise<void> {
    for (const afterCreateCallback of localRoom.afterCreateCallbacks) {
        await afterCreateCallback(roomId);
    }

    localRoom.afterCreateCallbacks = [];
}
