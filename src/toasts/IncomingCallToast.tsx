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

import React, { useCallback, useEffect } from 'react';
import { MatrixEvent } from "matrix-js-sdk/src/models/event";

import { _t } from '../languageHandler';
import RoomAvatar from '../components/views/avatars/RoomAvatar';
import AccessibleButton from '../components/views/elements/AccessibleButton';
import { MatrixClientPeg } from "../MatrixClientPeg";
import defaultDispatcher from "../dispatcher/dispatcher";
import { ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import { Action } from "../dispatcher/actions";
import ToastStore from "../stores/ToastStore";
import AccessibleTooltipButton from "../components/views/elements/AccessibleTooltipButton";
import { LiveContentSummary, LiveContentType } from "../components/views/rooms/LiveContentSummary";
import { useCall, useParticipants } from "../hooks/useCall";
import { useRoomState } from "../hooks/useRoomState";

export const getIncomingCallToastKey = (stateKey: string) => `call_${stateKey}`;

interface IProps {
    callEvent: MatrixEvent;
}

export function IncomingCallToast({ callEvent }: IProps) {
    const roomId = callEvent.getRoomId()!;
    const room = MatrixClientPeg.get().getRoom(roomId);
    const call = useCall(roomId);
    const participants = useParticipants(call);

    const dismissToast = useCallback((): void => {
        ToastStore.sharedInstance().dismissToast(getIncomingCallToastKey(callEvent.getStateKey()!));
    }, [callEvent]);

    const latestEvent = useRoomState(room, (state) => {
        return state.getStateEvents(callEvent.getType(), callEvent.getStateKey()!);
    });

    useEffect(() => {
        if ("m.terminated" in latestEvent.getContent()) {
            dismissToast();
        }
    }, [latestEvent, dismissToast]);

    const onJoinClick = (e: React.MouseEvent): void => {
        e.stopPropagation();

        defaultDispatcher.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: room.roomId,
            view_call: true,
            metricsTrigger: undefined,
        });
        dismissToast();
    };

    const onCloseClick = (e: React.MouseEvent): void => {
        e.stopPropagation();

        dismissToast();
    };

    return <React.Fragment>
        <RoomAvatar
            room={room ?? undefined}
            height={24}
            width={24}
        />
        <div className="mx_IncomingCallToast_content">
            <div className="mx_CallEvent_info">
                <span className="mx_CallEvent_room">
                    { room ? room.name : _t("Unknown room") }
                </span>
                <div className="mx_CallEvent_message">
                    { _t("Video call started") }
                </div>
                <LiveContentSummary
                    type={LiveContentType.Video}
                    text={_t("Video call")}
                    active={false}
                    participantCount={participants?.size ?? 0}
                />
            </div>
        </div>
        <AccessibleButton
            className="mx_IncomingCallToast_joinButton"
            onClick={onJoinClick}
            kind="primary"
        >
            { _t("Join") }
        </AccessibleButton>
        <AccessibleTooltipButton
            className="mx_IncomingCallToast_closeButton"
            onClick={onCloseClick}
            title={_t("Close")}
        />
    </React.Fragment>;
}
