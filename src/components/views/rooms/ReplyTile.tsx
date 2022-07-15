/*
Copyright 2020-2021 Tulir Asokan <tulir@maunium.net>

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

import React, { createRef } from 'react';
import classNames from 'classnames';
import { MatrixEvent, MatrixEventEvent } from "matrix-js-sdk/src/models/event";
import { EventType, MsgType } from 'matrix-js-sdk/src/@types/event';
import { logger } from "matrix-js-sdk/src/logger";
import { Relations } from 'matrix-js-sdk/src/models/relations';

import { _t } from '../../../languageHandler';
import dis from '../../../dispatcher/dispatcher';
import { Action } from '../../../dispatcher/actions';
import { RoomPermalinkCreator } from '../../../utils/permalinks/Permalinks';
import SenderProfile from "../messages/SenderProfile";
import MImageReplyBody from "../messages/MImageReplyBody";
import { isVoiceMessage } from '../../../utils/EventUtils';
import { getEventDisplayInfo } from "../../../utils/EventRenderingUtils";
import MVoiceMessageBody from "../messages/MVoiceMessageBody";
import { ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import { renderReplyTile } from "../../../events/EventTileFactory";
import MFileReplyBody from '../messages/MFileReplyBody';

interface IProps {
    mxEvent: MatrixEvent;
    permalinkCreator?: RoomPermalinkCreator;
    highlights?: string[];
    highlightLink?: string;
    onHeightChanged?(): void;
    toggleExpandedQuote?: () => void;
    getRelationsForEvent?: (
        (eventId: string, relationType: string, eventType: string) => Relations
    );
    showSenderProfile?: boolean;
}

export default class ReplyTile extends React.PureComponent<IProps> {
    private anchorElement = createRef<HTMLAnchorElement>();

    static defaultProps = {
        onHeightChanged: () => {},
        showSenderProfile: true,
    };

    componentDidMount() {
        this.props.mxEvent.on(MatrixEventEvent.Decrypted, this.onDecrypted);
        this.props.mxEvent.on(MatrixEventEvent.BeforeRedaction, this.onEventRequiresUpdate);
        this.props.mxEvent.on(MatrixEventEvent.Replaced, this.onEventRequiresUpdate);
    }

    componentWillUnmount() {
        this.props.mxEvent.removeListener(MatrixEventEvent.Decrypted, this.onDecrypted);
        this.props.mxEvent.removeListener(MatrixEventEvent.BeforeRedaction, this.onEventRequiresUpdate);
        this.props.mxEvent.removeListener(MatrixEventEvent.Replaced, this.onEventRequiresUpdate);
    }

    private onDecrypted = (): void => {
        this.forceUpdate();
        if (this.props.onHeightChanged) {
            this.props.onHeightChanged();
        }
    };

    private onEventRequiresUpdate = (): void => {
        // Force update when necessary - redactions and edits
        this.forceUpdate();
    };

    private onClick = (e: React.MouseEvent): void => {
        const clickTarget = e.target as HTMLElement;

        // Clicking an image should open it and
        // should not dispatch the `view_room` action
        if (
            clickTarget.tagName.toLowerCase() === "img"
        ) {
            e.preventDefault();
        }
        // Playling a voice message or changing the play position
        // should not dispatch the `view_room` action
        else if (
            clickTarget.classList.contains("mx_SeekBar") ||
            clickTarget.getAttribute("data-test-id") === "play-pause-button"
        ) {
            e.preventDefault();
        }
        // Following a link within a reply should not dispatch the `view_room` action
        // so that the browser can direct the user to the correct location
        // The exception being the link wrapping the reply
        else if (
            clickTarget.tagName.toLowerCase() !== "a" ||
            clickTarget.closest("a") === null ||
            clickTarget === this.anchorElement.current
        ) {
            // This allows the permalink to be opened in a new tab/window or copied as
            // matrix.to, but also for it to enable routing within Riot when clicked.
            e.preventDefault();
            // Expand thread on shift key
            if (this.props.toggleExpandedQuote && e.shiftKey) {
                this.props.toggleExpandedQuote();
            } else {
                dis.dispatch<ViewRoomPayload>({
                    action: Action.ViewRoom,
                    event_id: this.props.mxEvent.getId(),
                    highlighted: true,
                    room_id: this.props.mxEvent.getRoomId(),
                    metricsTrigger: undefined, // room doesn't change
                });
            }
        }
    };

    render() {
        const mxEvent = this.props.mxEvent;
        const msgType = mxEvent.getContent().msgtype;
        const evType = mxEvent.getType() as EventType;

        const {
            hasRenderer, isInfoMessage, isSeeingThroughMessageHiddenForModeration,
        } = getEventDisplayInfo(mxEvent, false /* Replies are never hidden, so this should be fine */);
        // This shouldn't happen: the caller should check we support this type
        // before trying to instantiate us
        if (!hasRenderer) {
            const { mxEvent } = this.props;
            logger.warn(`Event type not supported: type:${mxEvent.getType()} isState:${mxEvent.isState()}`);
            return <div className="mx_ReplyTile mx_ReplyTile_info mx_MNoticeBody">
                { _t('This event could not be displayed') }
            </div>;
        }

        const classes = classNames("mx_ReplyTile", {
            mx_ReplyTile_info: isInfoMessage && !mxEvent.isRedacted(),
            mx_ReplyTile_audio: msgType === MsgType.Audio,
            mx_ReplyTile_video: msgType === MsgType.Video,
        });

        let permalink = "#";
        if (this.props.permalinkCreator) {
            permalink = this.props.permalinkCreator.forEvent(mxEvent.getId());
        }

        let sender;
        const needsSenderProfile = (
            this.props.showSenderProfile
            && !isInfoMessage
            && msgType !== MsgType.Image
            && evType !== EventType.Sticker
            && evType !== EventType.RoomCreate
        );

        if (needsSenderProfile) {
            sender = <SenderProfile
                mxEvent={mxEvent}
            />;
        }

        const msgtypeOverrides: Record<string, typeof React.Component> = {
            [MsgType.Image]: MImageReplyBody,
            // Override file body (including audio and video) with reply file body. We also hide the download/decrypt button using CSS
            [MsgType.Audio]: isVoiceMessage(mxEvent) ? MVoiceMessageBody : MFileReplyBody,
            [MsgType.Video]: MFileReplyBody,
            [MsgType.File]: MFileReplyBody,
        };
        const evOverrides: Record<string, typeof React.Component> = {
            // Use MImageReplyBody so that the sticker isn't taking up a lot of space
            [EventType.Sticker]: MImageReplyBody,
        };

        return (
            <div className={classes}>
                <a href={permalink} onClick={this.onClick} ref={this.anchorElement}>
                    { sender }
                    { renderReplyTile({
                        ...this.props,

                        // overrides
                        ref: null,
                        showUrlPreview: false,
                        overrideBodyTypes: msgtypeOverrides,
                        overrideEventTypes: evOverrides,
                        maxImageHeight: 96,
                        isSeeingThroughMessageHiddenForModeration,

                        // appease TS
                        highlights: this.props.highlights,
                        highlightLink: this.props.highlightLink,
                        onHeightChanged: this.props.onHeightChanged,
                        permalinkCreator: this.props.permalinkCreator,
                    }, false /* showHiddenEvents shouldn't be relevant */) }
                </a>
            </div>
        );
    }
}
