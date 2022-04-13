/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import React, { FC, HTMLAttributes, ReactNode, useContext } from "react";
import { Room } from "matrix-js-sdk/src/models/room";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { sortBy } from "lodash";

import MemberAvatar from "../avatars/MemberAvatar";
import { _t } from "../../../languageHandler";
import DMRoomMap from "../../../utils/DMRoomMap";
import TooltipTarget from "../elements/TooltipTarget";
import TextWithTooltip from "../elements/TextWithTooltip";
import { useRoomMembers } from "../../../hooks/useRoomMembers";
import MatrixClientContext from "../../../contexts/MatrixClientContext";

interface IProps extends HTMLAttributes<HTMLSpanElement> {
    members: RoomMember[];
    faceSize: number;
    overflow: boolean;
    tooltip?: ReactNode;
    children?: ReactNode;
}

const FacePile: FC<IProps> = ({ members, faceSize, overflow, tooltip, children, ...props }) => {
    const faces = members.map(
        tooltip ?
            m => <MemberAvatar key={m.userId} member={m} width={faceSize} height={faceSize} /> :
            m => <TooltipTarget key={m.userId} label={m.name}>
                <MemberAvatar member={m} width={faceSize} height={faceSize} viewUserOnClick={!props.onClick} />
            </TooltipTarget>,
    );

    const pileContents = <>
        { overflow ? <span className="mx_FacePile_more" /> : null }
        { faces }
    </>;

    return <div {...props} className="mx_FacePile">
        { tooltip ? (
            <TextWithTooltip class="mx_FacePile_faces" tooltip={tooltip} tooltipProps={{ yOffset: 32 }}>
                { pileContents }
            </TextWithTooltip>
        ) : (
            <div className="mx_FacePile_faces">
                { pileContents }
            </div>
        ) }
        { children }
    </div>;
};

export default FacePile;

const DEFAULT_NUM_FACES = 5;

const isKnownMember = (member: RoomMember) => !!DMRoomMap.shared().getDMRoomsForUserId(member.userId)?.length;

interface IRoomProps extends HTMLAttributes<HTMLSpanElement> {
    room: Room;
    onlyKnownUsers?: boolean;
    numShown?: number;
}

export const RoomFacePile: FC<IRoomProps> = (
    { room, onlyKnownUsers = true, numShown = DEFAULT_NUM_FACES, ...props },
) => {
    const cli = useContext(MatrixClientContext);
    const isJoined = room.getMyMembership() === "join";
    let members = useRoomMembers(room);
    const count = members.length;

    // sort users with an explicit avatar first
    const iteratees = [member => member.getMxcAvatarUrl() ? 0 : 1];
    if (onlyKnownUsers) {
        members = members.filter(isKnownMember);
    } else {
        // sort known users first
        iteratees.unshift(member => isKnownMember(member) ? 0 : 1);
    }

    // exclude ourselves from the shown members list
    const shownMembers = sortBy(members.filter(m => m.userId !== cli.getUserId()), iteratees).slice(0, numShown);
    if (shownMembers.length < 1) return null;

    // We reverse the order of the shown faces in CSS to simplify their visual overlap,
    // reverse members in tooltip order to make the order between the two match up.
    const commaSeparatedMembers = shownMembers.map(m => m.name).reverse().join(", ");

    let tooltip: ReactNode;
    if (props.onClick) {
        let subText: string;
        if (isJoined) {
            subText = _t("Including you, %(commaSeparatedMembers)s", { commaSeparatedMembers });
        } else {
            subText = _t("Including %(commaSeparatedMembers)s", { commaSeparatedMembers });
        }

        tooltip = <div>
            <div className="mx_Tooltip_title">
                { _t("View all %(count)s members", { count }) }
            </div>
            <div className="mx_Tooltip_sub">
                { subText }
            </div>
        </div>;
    } else {
        if (isJoined) {
            tooltip = _t("%(count)s members including you, %(commaSeparatedMembers)s", {
                count: count - 1,
                commaSeparatedMembers,
            });
        } else {
            tooltip = _t("%(count)s members including %(commaSeparatedMembers)s", {
                count,
                commaSeparatedMembers,
            });
        }
    }

    return <FacePile
        members={shownMembers}
        faceSize={28}
        overflow={members.length > numShown}
        tooltip={tooltip}
        {...props}
    >
        { onlyKnownUsers && <span className="mx_FacePile_summary">
            { _t("%(count)s people you know have already joined", { count: members.length }) }
        </span> }
    </FacePile>;
};
