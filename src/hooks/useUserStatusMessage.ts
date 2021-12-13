/*
Copyright 2021 Šimon Brandner <simon.bra.ag@gmail.com>

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

import { RoomMember } from "matrix-js-sdk";
import { User } from "matrix-js-sdk/src/models/user";
import { useCallback, useEffect, useState } from "react";

import { GroupMember } from "../components/views/right_panel/UserInfo";
import { MatrixClientPeg } from "../MatrixClientPeg";
import { useEventEmitter } from "./useEventEmitter";

type StatusMessageUser = User | RoomMember | GroupMember;

const getUser = (user: StatusMessageUser): User => MatrixClientPeg.get().getUser(user?.userId);
const getStatusMessage = (user: StatusMessageUser): string => getUser(user).unstable_statusMessage;

// Hook to simplify handling Matrix User status
export const useUserStatusMessage = (user?: StatusMessageUser): string => {
    return useEventEmitterState(getUser(User), "User.unstable_statusMessage", () => {
        return getStatusMessage(user);
    });
};
