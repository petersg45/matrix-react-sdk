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

import React, { useState } from 'react';
import { MatrixClient } from 'matrix-js-sdk/src/client';
import { RoomMember } from 'matrix-js-sdk/src/models/room-member';
import { Room } from 'matrix-js-sdk/src/models/room';
import { EventTimeline } from 'matrix-js-sdk/src/models/event-timeline';
import { EventType } from "matrix-js-sdk/src/@types/event";

import { _t } from '../../../languageHandler';
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { IDialogProps } from "../dialogs/IDialogProps";
import BaseDialog from "../dialogs/BaseDialog";
import InfoDialog from "../dialogs/InfoDialog";
import DialogButtons from "../elements/DialogButtons";
import StyledCheckbox from "../elements/StyledCheckbox";

interface IBulkRedactDialogProps extends IDialogProps {
    matrixClient: MatrixClient;
    room: Room;
    member: RoomMember;
}

const BulkRedactDialog: React.FC<IBulkRedactDialogProps> = props => {
    const { matrixClient: cli, room, member, onFinished } = props;
    const [keepStateEvents, setKeepStateEvents] = useState(false);

    let timeline = room.getLiveTimeline();
    let eventsToRedact = [];
    while (timeline) {
        eventsToRedact = eventsToRedact.concat(timeline.getEvents().filter(event =>
            event.getSender() === member.userId &&
                !event.isRedacted() && !event.isRedaction() &&
                !(keepStateEvents && event.isState()) &&
                event.getType() !== EventType.RoomCreate &&
                // Don't redact ACLs because that'll obliterate the room
                // See https://github.com/matrix-org/synapse/issues/4042 for details.
                event.getType() !== EventType.RoomServerAcl &&
                // Redacting encryption events is equally bad
                event.getType() !== EventType.RoomEncryption,
        ));
        timeline = timeline.getNeighbouringTimeline(EventTimeline.BACKWARDS);
    }
    const count = eventsToRedact.length;
    const user = member.name;

    const redact = async () => {
        console.info(`Started redacting recent ${count} messages for ${member.userId} in ${room.roomId}`);
        dis.dispatch({
            action: Action.BulkRedactStart,
            room_id: room.roomId,
        });

        // Submitting a large number of redactions freezes the UI,
        // so first yield to allow to rerender after closing the dialog.
        await Promise.resolve();
        await Promise.all(eventsToRedact.map(async event => {
            try {
                await cli.redactEvent(room.roomId, event.getId());
            } catch (err) {
                // log and swallow errors
                console.error("Could not redact", event.getId());
                console.error(err);
            }
        }));

        console.info(`Finished redacting recent ${count} messages for ${member.userId} in ${room.roomId}`);
        dis.dispatch({
            action: Action.BulkRedactEnd,
            room_id: room.roomId,
        });
    };

    if (count === 0 && !keepStateEvents) {
        return <InfoDialog
            onFinished={onFinished}
            title={_t("No recent messages by %(user)s found", {user})}
            description={
                <div>
                    <p>{ _t("Try scrolling up in the timeline to see if there are any earlier ones.") }</p>
                </div>
            }
        />;
    } else {
        return <BaseDialog
            onFinished={onFinished}
            title={_t("Remove recent messages by %(user)s", {user})}
            contentId="mx_Dialog_content"
        >
            <div className="mx_Dialog_content" id="mx_Dialog_content">
                <p>{ _t("You are about to remove %(count)s messages by %(user)s. " +
                    "This cannot be undone. Do you wish to continue?", {count, user}) }</p>
                <p>{ _t("For a large amount of messages, this might take some time. " +
                    "Please don't refresh your client in the meantime.") }</p>
                <StyledCheckbox
                    checked={keepStateEvents}
                    onChange={e => setKeepStateEvents(e.target.checked)}
                >
                    { _t("Keep state events (e.g. profile changes)") }
                </StyledCheckbox>
            </div>
            <DialogButtons
                primaryButton={_t("Remove %(count)s messages", {count})}
                primaryButtonClass="danger"
                primaryDisabled={count === 0}
                onPrimaryButtonClick={() => { setImmediate(redact); onFinished(true); }}
                onCancel={() => onFinished(false)}
            >
            </DialogButtons>
        </BaseDialog>;
    }
};

export default BulkRedactDialog;
