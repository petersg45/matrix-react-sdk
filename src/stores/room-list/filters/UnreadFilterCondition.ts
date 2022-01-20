/*
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

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

import { Room } from "matrix-js-sdk/src/models/room";
import { EventEmitter } from "events";

import { FilterKind, IFilterCondition } from "./IFilterCondition";
import { RoomNotificationStateStore } from "../../notifications/RoomNotificationStateStore";

/**
 * A filter condition for the room list which reveals rooms of a particular
 * name, or associated name (like a room alias).
 */
export class UnreadFilterCondition extends EventEmitter implements IFilterCondition {
    constructor() {
        super();
    }

    public get kind(): FilterKind {
        return FilterKind.Runtime;
    }

    public isVisible(room: Room): boolean {
        const state = RoomNotificationStateStore.instance.getRoomState(room);
        return state.isUnread;
    }
}
