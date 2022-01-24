/*
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>
Copyright 2015 - 2021 The Matrix.org Foundation C.I.C.

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
import { EventStatus, MatrixEvent } from 'matrix-js-sdk/src/models/event';
import { EventType, RelationType } from "matrix-js-sdk/src/@types/event";
import { Relations } from 'matrix-js-sdk/src/models/relations';
import { LOCATION_EVENT_TYPE } from 'matrix-js-sdk/src/@types/location';
import { M_POLL_START } from "matrix-events-sdk";

import { MatrixClientPeg } from '../../../MatrixClientPeg';
import dis from '../../../dispatcher/dispatcher';
import { _t } from '../../../languageHandler';
import Modal from '../../../Modal';
import Resend from '../../../Resend';
import SettingsStore from '../../../settings/SettingsStore';
import { isUrlPermitted } from '../../../HtmlUtils';
import { canEditContent, isContentActionable } from '../../../utils/EventUtils';
import IconizedContextMenu, { IconizedContextMenuOption, IconizedContextMenuOptionList } from './IconizedContextMenu';
import { replaceableComponent } from "../../../utils/replaceableComponent";
import { ReadPinsEventId } from "../right_panel/PinnedMessagesCard";
import ForwardDialog from "../dialogs/ForwardDialog";
import { Action } from "../../../dispatcher/actions";
import { RoomPermalinkCreator } from '../../../utils/permalinks/Permalinks';
import { ButtonEvent } from '../elements/AccessibleButton';
import { copyPlaintext } from '../../../utils/strings';
import ContextMenu, { toRightOf } from '../../structures/ContextMenu';
import ReactionPicker from '../emojipicker/ReactionPicker';
import ReportEventDialog from '../dialogs/ReportEventDialog';
import ViewSource from '../../structures/ViewSource';
import { createRedactEventDialog } from '../dialogs/ConfirmRedactDialog';
import ShareDialog from '../dialogs/ShareDialog';
import { IPosition, ChevronFace } from '../../structures/ContextMenu';
import RoomContext, { TimelineRenderingType } from '../../../contexts/RoomContext';
import { ComposerInsertPayload } from "../../../dispatcher/payloads/ComposerInsertPayload";
import { WidgetLayoutStore } from '../../../stores/widgets/WidgetLayoutStore';
import EndPollDialog from '../dialogs/EndPollDialog';
import { isPollEnded } from '../messages/MPollBody';
import { createMapSiteLink } from "../messages/MLocationBody";

export function canCancel(status: EventStatus): boolean {
    return status === EventStatus.QUEUED || status === EventStatus.NOT_SENT || status === EventStatus.ENCRYPTING;
}

export interface IEventTileOps {
    isWidgetHidden(): boolean;
    unhideWidget(): void;
}

export interface IOperableEventTile {
    getEventTileOps(): IEventTileOps;
}

interface IProps extends IPosition {
    chevronFace: ChevronFace;
    /* the MatrixEvent associated with the context menu */
    mxEvent: MatrixEvent;
    // An optional EventTileOps implementation that can be used to unhide preview widgets
    eventTileOps?: IEventTileOps;
    // Callback called when the menu is dismissed
    permalinkCreator?: RoomPermalinkCreator;
    /* an optional function to be called when the user clicks collapse thread, if not provided hide button */
    collapseReplyChain?(): void;
    /* callback called when the menu is dismissed */
    onFinished(): void;
    // If the menu is inside a dialog, we sometimes need to close that dialog after click (forwarding)
    onCloseDialog?(): void;
    // True if the menu is being used as a right click menu
    rightClick?: boolean;
    // The Relations model from the JS SDK for reactions to `mxEvent`
    reactions?: Relations;
    // A permalink to the event
    showPermalink?: boolean;

    getRelationsForEvent?: (
        eventId: string,
        relationType: string,
        eventType: string
    ) => Relations;
}

interface IState {
    canRedact: boolean;
    canPin: boolean;
    reactionPickerDisplayed: boolean;
}

@replaceableComponent("views.context_menus.MessageContextMenu")
export default class MessageContextMenu extends React.Component<IProps, IState> {
    static contextType = RoomContext;
    public context!: React.ContextType<typeof RoomContext>;

    private reactButtonRef = createRef<any>(); // XXX Ref to a functional component

    constructor(props: IProps) {
        super(props);

        this.state = {
            canRedact: false,
            canPin: false,
            reactionPickerDisplayed: false,
        };
    }

    componentDidMount() {
        MatrixClientPeg.get().on('RoomMember.powerLevel', this.checkPermissions);
        this.checkPermissions();
    }

    componentWillUnmount() {
        const cli = MatrixClientPeg.get();
        if (cli) {
            cli.removeListener('RoomMember.powerLevel', this.checkPermissions);
        }
    }

    private checkPermissions = (): void => {
        const cli = MatrixClientPeg.get();
        const room = cli.getRoom(this.props.mxEvent.getRoomId());

        // We explicitly decline to show the redact option on ACL events as it has a potential
        // to obliterate the room - https://github.com/matrix-org/synapse/issues/4042
        // Similarly for encryption events, since redacting them "breaks everything"
        const canRedact = room.currentState.maySendRedactionForEvent(this.props.mxEvent, cli.credentials.userId)
            && this.props.mxEvent.getType() !== EventType.RoomServerAcl
            && this.props.mxEvent.getType() !== EventType.RoomEncryption;
        let canPin = room.currentState.mayClientSendStateEvent(EventType.RoomPinnedEvents, cli);

        // HACK: Intentionally say we can't pin if the user doesn't want to use the functionality
        if (!SettingsStore.getValue("feature_pinning")) canPin = false;

        this.setState({ canRedact, canPin });
    };

    private isPinned(): boolean {
        const room = MatrixClientPeg.get().getRoom(this.props.mxEvent.getRoomId());
        const pinnedEvent = room.currentState.getStateEvents(EventType.RoomPinnedEvents, '');
        if (!pinnedEvent) return false;
        const content = pinnedEvent.getContent();
        return content.pinned && Array.isArray(content.pinned) && content.pinned.includes(this.props.mxEvent.getId());
    }

    private canOpenInMapSite(mxEvent: MatrixEvent): boolean {
        return isLocationEvent(mxEvent);
    }

    private canEndPoll(mxEvent: MatrixEvent): boolean {
        return (
            M_POLL_START.matches(mxEvent.getType()) &&
            this.state.canRedact &&
            !isPollEnded(mxEvent, MatrixClientPeg.get(), this.props.getRelationsForEvent)
        );
    }

    private onResendReactionsClick = (): void => {
        for (const reaction of this.getUnsentReactions()) {
            Resend.resend(reaction);
        }
        this.closeMenu();
    };

    private onReportEventClick = (): void => {
        Modal.createTrackedDialog('Report Event', '', ReportEventDialog, {
            mxEvent: this.props.mxEvent,
        }, 'mx_Dialog_reportEvent');
        this.closeMenu();
    };

    private onViewSourceClick = (): void => {
        Modal.createTrackedDialog('View Event Source', '', ViewSource, {
            mxEvent: this.props.mxEvent,
        }, 'mx_Dialog_viewsource');
        this.closeMenu();
    };

    private onRedactClick = (): void => {
        const { mxEvent, onCloseDialog } = this.props;
        createRedactEventDialog({
            mxEvent,
            onCloseDialog,
        });
        this.closeMenu();
    };

    private onForwardClick = (): void => {
        Modal.createTrackedDialog('Forward Message', '', ForwardDialog, {
            matrixClient: MatrixClientPeg.get(),
            event: this.props.mxEvent,
            permalinkCreator: this.props.permalinkCreator,
        });
        this.closeMenu();
    };

    private onPinClick = (): void => {
        const cli = MatrixClientPeg.get();
        const room = cli.getRoom(this.props.mxEvent.getRoomId());
        const eventId = this.props.mxEvent.getId();

        const pinnedIds = room?.currentState?.getStateEvents(EventType.RoomPinnedEvents, "")?.getContent().pinned || [];
        if (pinnedIds.includes(eventId)) {
            pinnedIds.splice(pinnedIds.indexOf(eventId), 1);
        } else {
            pinnedIds.push(eventId);
            cli.setRoomAccountData(room.roomId, ReadPinsEventId, {
                event_ids: [
                    ...(room.getAccountData(ReadPinsEventId)?.getContent()?.event_ids || []),
                    eventId,
                ],
            });
        }
        cli.sendStateEvent(this.props.mxEvent.getRoomId(), EventType.RoomPinnedEvents, { pinned: pinnedIds }, "");
        this.closeMenu();
    };

    private closeMenu = (): void => {
        this.props.onFinished();
    };

    private onUnhidePreviewClick = (): void => {
        this.props.eventTileOps?.unhideWidget();
        this.closeMenu();
    };

    private onQuoteClick = (): void => {
        dis.dispatch<ComposerInsertPayload>({
            action: Action.ComposerInsert,
            event: this.props.mxEvent,
            timelineRenderingType: this.context.timelineRenderingType,
        });
        this.closeMenu();
    };

    private onPermalinkClick = (e: React.MouseEvent): void => {
        e.preventDefault();
        Modal.createTrackedDialog('share room message dialog', '', ShareDialog, {
            target: this.props.mxEvent,
            permalinkCreator: this.props.permalinkCreator,
        });
        this.closeMenu();
    };

    private onCopyPermalinkClick = (e: ButtonEvent): void => {
        e.preventDefault(); // So that we don't open the permalink
        copyPlaintext(this.getPermalink());
        this.closeMenu();
    };

    private onCollapseReplyChainClick = (): void => {
        this.props.collapseReplyChain();
        this.closeMenu();
    };

    private onCopyClick = (): void => {
        copyPlaintext(this.getSelectedText());
        this.closeMenu();
    };

    private onEditClick = (): void => {
        dis.dispatch({
            action: Action.EditEvent,
            event: this.props.mxEvent,
            timelineRenderingType: this.context.timelineRenderingType,
        });
        this.closeMenu();
    };

    private onReplyClick = (): void => {
        dis.dispatch({
            action: 'reply_to_event',
            event: this.props.mxEvent,
            context: this.context.timelineRenderingType,
        });
        this.closeMenu();
    };

    private onReactClick = (): void => {
        this.setState({ reactionPickerDisplayed: true });
    };

    private onCloseReactionPicker = (): void => {
        this.setState({ reactionPickerDisplayed: false });
        this.closeMenu();
    };

    private onEndPollClick = (): void => {
        const matrixClient = MatrixClientPeg.get();
        Modal.createTrackedDialog('End Poll', '', EndPollDialog, {
            matrixClient,
            event: this.props.mxEvent,
            getRelationsForEvent: this.props.getRelationsForEvent,
        }, 'mx_Dialog_endPoll');
        this.closeMenu();
    };

    private getReactions(filter: (e: MatrixEvent) => boolean): MatrixEvent[] {
        const cli = MatrixClientPeg.get();
        const room = cli.getRoom(this.props.mxEvent.getRoomId());
        const eventId = this.props.mxEvent.getId();
        return room.getPendingEvents().filter(e => {
            const relation = e.getRelation();
            return relation?.rel_type === RelationType.Annotation && relation.event_id === eventId && filter(e);
        });
    }

    private getSelectedText(): string {
        return window.getSelection().toString();
    }

    private getPermalink(): string {
        if (!this.props.permalinkCreator) return;
        return this.props.permalinkCreator.forEvent(this.props.mxEvent.getId());
    }

    private getUnsentReactions(): MatrixEvent[] {
        return this.getReactions(e => e.status === EventStatus.NOT_SENT);
    }

    private viewInRoom = () => {
        dis.dispatch({
            action: Action.ViewRoom,
            event_id: this.props.mxEvent.getId(),
            highlighted: true,
            room_id: this.props.mxEvent.getRoomId(),
        });
        this.closeMenu();
    };

    render() {
        const cli = MatrixClientPeg.get();
        const me = cli.getUserId();
        const mxEvent = this.props.mxEvent;
        const eventStatus = mxEvent.status;
        const unsentReactionsCount = this.getUnsentReactions().length;
        const contentActionable = isContentActionable(this.props.mxEvent);
        const rightClick = this.props.rightClick;
        const context = this.context;
        const permalink = this.getPermalink();

        let openInMapSiteButton: JSX.Element;
        let endPollButton: JSX.Element;
        let resendReactionsButton: JSX.Element;
        let redactButton: JSX.Element;
        let forwardButton: JSX.Element;
        let pinButton: JSX.Element;
        let unhidePreviewButton: JSX.Element;
        let externalURLButton: JSX.Element;
        let quoteButton: JSX.Element;
        let redactItemList: JSX.Element;
        let reportEventButton: JSX.Element;
        let copyButton: JSX.Element;
        let editButton: JSX.Element;
        let replyButton: JSX.Element;
        let reactButton: JSX.Element;
        let reactionPicker: JSX.Element;
        let quickItemsList: JSX.Element;
        let nativeItemsList: JSX.Element;
        let permalinkButton: JSX.Element;
        let collapseReplyChain: JSX.Element;

        // status is SENT before remote-echo, null after
        const isSent = !eventStatus || eventStatus === EventStatus.SENT;
        if (!mxEvent.isRedacted()) {
            if (unsentReactionsCount !== 0) {
                resendReactionsButton = (
                    <IconizedContextMenuOption
                        iconClassName="mx_MessageContextMenu_iconResend"
                        label={_t('Resend %(unsentCount)s reaction(s)', { unsentCount: unsentReactionsCount })}
                        onClick={this.onResendReactionsClick}
                    />
                );
            }
        }

        if (isSent && this.state.canRedact) {
            redactButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconRedact"
                    label={_t("Remove")}
                    onClick={this.onRedactClick}
                />
            );
        }

        if (this.canOpenInMapSite(mxEvent)) {
            const mapSiteLink = createMapSiteLink(mxEvent);
            openInMapSiteButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconOpenInMapSite"
                    onClick={null}
                    label={_t('Open in OpenStreetMap')}
                    element="a"
                    {
                        ...{
                            href: mapSiteLink,
                            target: "_blank",
                            rel: "noreferrer noopener",
                        }
                    }
                />
            );
        }

        if (contentActionable) {
            if (canForward(mxEvent)) {
                forwardButton = (
                    <IconizedContextMenuOption
                        iconClassName="mx_MessageContextMenu_iconForward"
                        label={_t("Forward")}
                        onClick={this.onForwardClick}
                    />
                );
            }

            if (this.state.canPin) {
                pinButton = (
                    <IconizedContextMenuOption
                        iconClassName="mx_MessageContextMenu_iconPin"
                        label={this.isPinned() ? _t('Unpin') : _t('Pin')}
                        onClick={this.onPinClick}
                    />
                );
            }
        }

        const viewSourceButton = (
            <IconizedContextMenuOption
                iconClassName="mx_MessageContextMenu_iconSource"
                label={_t("View source")}
                onClick={this.onViewSourceClick}
            />
        );

        if (this.props.eventTileOps) {
            if (this.props.eventTileOps.isWidgetHidden()) {
                unhidePreviewButton = (
                    <IconizedContextMenuOption
                        iconClassName="mx_MessageContextMenu_iconUnhidePreview"
                        label={_t("Show preview")}
                        onClick={this.onUnhidePreviewClick}
                    />
                );
            }
        }

        if (rightClick && permalink) {
            if (this.props.showPermalink) {
                permalinkButton = (
                    <IconizedContextMenuOption
                        iconClassName="mx_MessageContextMenu_iconCopy"
                        onClick={this.onCopyPermalinkClick}
                        label={_t('Copy link')}
                        element="a"
                        href={permalink}
                        target="_blank"
                        rel="noreferrer noopener"
                    />
                );
            } else {
                permalinkButton = (
                    <IconizedContextMenuOption
                        iconClassName="mx_MessageContextMenu_iconPermalink"
                        onClick={this.onPermalinkClick}
                        label={_t('Share')}
                        element="a"
                        href={permalink}
                        target="_blank"
                        rel="noreferrer noopener"
                    />
                );
            }
        }

        if (this.canEndPoll(mxEvent)) {
            endPollButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconEndPoll"
                    label={_t("End Poll")}
                    onClick={this.onEndPollClick}
                />
            );
        }

        if (this.props.eventTileOps) { // this event is rendered using TextualBody
            quoteButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconQuote"
                    label={_t("Quote")}
                    onClick={this.onQuoteClick}
                />
            );
        }

        // Bridges can provide a 'external_url' to link back to the source.
        if (typeof (mxEvent.getContent().external_url) === "string" &&
            isUrlPermitted(mxEvent.getContent().external_url)
        ) {
            externalURLButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconLink"
                    onClick={this.closeMenu}
                    label={_t('Source URL')}
                    element="a"
                    {
                        // XXX: Typescript signature for AccessibleButton doesn't work properly for non-inputs like `a`
                        ...{
                            target: "_blank",
                            rel: "noreferrer noopener",
                            href: mxEvent.getContent().external_url,
                        }
                    }
                />
            );
        }

        if (this.props.collapseReplyChain) {
            collapseReplyChain = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconCollapse"
                    label={_t("Collapse reply thread")}
                    onClick={this.onCollapseReplyChainClick}
                />
            );
        }

        if (mxEvent.getSender() !== me) {
            reportEventButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconReport"
                    label={_t("Report")}
                    onClick={this.onReportEventClick}
                />
            );
        }

        if (rightClick && this.getSelectedText()) {
            copyButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconCopy"
                    label={_t("Copy")}
                    triggerOnMouseDown={true} // We use onMouseDown so that the selection isn't cleared when we click
                    onClick={this.onCopyClick}
                />
            );
        }

        if (rightClick && canEditContent(mxEvent)) {
            editButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconEdit"
                    label={_t("Edit")}
                    onClick={this.onEditClick}
                />
            );
        }

        if (rightClick && contentActionable && context.canReply) {
            replyButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconReply"
                    label={_t("Reply")}
                    onClick={this.onReplyClick}
                />
            );
        }

        if (rightClick && contentActionable && context.canReact) {
            reactButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconReact"
                    label={_t("React")}
                    onClick={this.onReactClick}
                    inputRef={this.reactButtonRef}
                />
            );
        }

        if (copyButton) {
            nativeItemsList = (
                <IconizedContextMenuOptionList>
                    { copyButton }
                </IconizedContextMenuOptionList>
            );
        }

        if (editButton || replyButton || reactButton) {
            quickItemsList = (
                <IconizedContextMenuOptionList>
                    { editButton }
                    { replyButton }
                    { reactButton }
                </IconizedContextMenuOptionList>
            );
        }

        const { timelineRenderingType } = this.context;
        const isThread = (
            timelineRenderingType === TimelineRenderingType.Thread ||
            timelineRenderingType === TimelineRenderingType.ThreadsList
        );
        const isThreadRootEvent = isThread && this.props.mxEvent?.getThread()?.rootEvent === this.props.mxEvent;

        const isMainSplitTimelineShown = !WidgetLayoutStore.instance.hasMaximisedWidget(
            MatrixClientPeg.get().getRoom(mxEvent.getRoomId()),
        );
        const commonItemsList = (
            <IconizedContextMenuOptionList>
                { (isThreadRootEvent && isMainSplitTimelineShown) && <IconizedContextMenuOption
                    iconClassName="mx_MessageContextMenu_iconViewInRoom"
                    label={_t("View in room")}
                    onClick={this.viewInRoom}
                /> }
                { openInMapSiteButton }
                { endPollButton }
                { quoteButton }
                { forwardButton }
                { pinButton }
                { permalinkButton }
                { reportEventButton }
                { externalURLButton }
                { unhidePreviewButton }
                { viewSourceButton }
                { resendReactionsButton }
                { collapseReplyChain }
            </IconizedContextMenuOptionList>
        );

        if (redactButton) {
            redactItemList = (
                <IconizedContextMenuOptionList red>
                    { redactButton }
                </IconizedContextMenuOptionList>
            );
        }

        if (this.state.reactionPickerDisplayed) {
            const buttonRect = (this.reactButtonRef.current as HTMLElement)?.getBoundingClientRect();
            reactionPicker = (
                <ContextMenu
                    {...toRightOf(buttonRect)}
                    onFinished={this.closeMenu}
                    managed={false}
                >
                    <ReactionPicker
                        mxEvent={mxEvent}
                        onFinished={this.onCloseReactionPicker}
                        reactions={this.props.reactions}
                    />
                </ContextMenu>
            );
        }

        return (
            <React.Fragment>
                <IconizedContextMenu
                    {...this.props}
                    className="mx_MessageContextMenu"
                    compact={true}
                >
                    { nativeItemsList }
                    { quickItemsList }
                    { commonItemsList }
                    { redactItemList }
                </IconizedContextMenu>
                { reactionPicker }
            </React.Fragment>
        );
    }
}

function canForward(event: MatrixEvent): boolean {
    return !isLocationEvent(event);
}

function isLocationEvent(event: MatrixEvent): boolean {
    const eventType = event.getType();
    return (
        LOCATION_EVENT_TYPE.matches(eventType) ||
        (
            eventType === EventType.RoomMessage &&
            LOCATION_EVENT_TYPE.matches(event.getContent().msgtype)
        )
    );
}
