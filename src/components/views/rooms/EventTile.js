/*
Copyright 2015, 2016 OpenMarket Ltd

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

'use strict';

var React = require('react');
var classNames = require("classnames");

var sdk = require('../../../index');
var MatrixClientPeg = require('../../../MatrixClientPeg')
var TextForEvent = require('../../../TextForEvent');

var ContextualMenu = require('../../structures/ContextualMenu');
var dispatcher = require("../../../dispatcher");

var ObjectUtils = require('../../../ObjectUtils');

var bounce = false;
try {
    if (global.localStorage) {
        bounce = global.localStorage.getItem('avatar_bounce') == 'true';
    }
} catch (e) {
}

var eventTileTypes = {
    'm.room.message': 'messages.MessageEvent',
    'm.room.member' : 'messages.TextualEvent',
    'm.call.invite' : 'messages.TextualEvent',
    'm.call.answer' : 'messages.TextualEvent',
    'm.call.hangup' : 'messages.TextualEvent',
    'm.room.name'   : 'messages.TextualEvent',
    'm.room.topic'  : 'messages.TextualEvent',
    'm.room.third_party_invite' : 'messages.TextualEvent',
    'm.room.history_visibility' : 'messages.TextualEvent',
};

var MAX_READ_AVATARS = 5;

module.exports = React.createClass({
    displayName: 'Event',

    statics: {
        haveTileForEvent: function(e) {
            if (e.isRedacted()) return false;
            if (eventTileTypes[e.getType()] == undefined) return false;
            if (eventTileTypes[e.getType()] == 'messages.TextualEvent') {
                return TextForEvent.textForEvent(e) !== '';
            } else {
                return true;
            }
        }
    },

    propTypes: {
        /* the MatrixEvent to show */
        mxEvent: React.PropTypes.object.isRequired,

        /* true if this is a continuation of the previous event (which has the
         * effect of not showing another avatar/displayname
         */
        continuation: React.PropTypes.bool,

        /* true if this is the last event in the timeline (which has the effect
         * of always showing the timestamp)
         */
        last: React.PropTypes.bool,

        /* true if this is search context (which has the effect of greying out
         * the text
         */
        contextual: React.PropTypes.bool,

        /* a list of words to highlight, ordered by longest first */
        highlights: React.PropTypes.array,

        /* link URL for the highlights */
        highlightLink: React.PropTypes.string,

        /* should show URL previews for this event */
        showUrlPreview: React.PropTypes.bool,

        /* is this the focused event */
        isSelectedEvent: React.PropTypes.bool,

        /* callback called when dynamic content in events are loaded */
        onWidgetLoad: React.PropTypes.func,

        /* a list of Room Members whose read-receipts we should show */
        readReceipts: React.PropTypes.arrayOf(React.PropTypes.object),

        /* opaque readreceipt info for each userId; used by ReadReceiptMarker
         * to manage its animations. Should be an empty object when the room
         * first loads
         */
        readReceiptMap: React.PropTypes.object,

        /* A function which is used to check if the parent panel is being
         * unmounted, to avoid unnecessary work. Should return true if we
         * are being unmounted.
         */
        checkUnmounting: React.PropTypes.func,

        /* the status of this event - ie, mxEvent.status. Denormalised to here so
         * that we can tell when it changes. */
        eventSendStatus: React.PropTypes.string,
    },

    getInitialState: function() {
        return {menu: false, allReadAvatars: false, verified: null};
    },

    componentWillMount: function() {
        // don't do RR animations until we are mounted
        this._suppressReadReceiptAnimation = true;
        this._verifyEvent(this.props.mxEvent);
    },

    componentDidMount: function() {
        this._suppressReadReceiptAnimation = false;
        MatrixClientPeg.get().on("deviceVerificationChanged", this.onDeviceVerificationChanged);
    },

    componentWillReceiveProps: function (nextProps) {
        if (nextProps.mxEvent !== this.props.mxEvent) {
            this._verifyEvent(nextProps.mxEvent);
        }
    },

    shouldComponentUpdate: function (nextProps, nextState) {
        if (!ObjectUtils.shallowEqual(this.state, nextState)) {
            return true;
        }

        if (!this._propsEqual(this.props, nextProps)) {
            return true;
        }

        return false;
    },

    componentWillUnmount: function() {
        var client = MatrixClientPeg.get();
        if (client) {
            client.removeListener("deviceVerificationChanged", this.onDeviceVerificationChanged);
        }
    },

    onDeviceVerificationChanged: function(userId, device) {
        if (userId == this.props.mxEvent.getSender()) {
            this._verifyEvent(this.props.mxEvent);
        }
    },

    _verifyEvent: function(mxEvent) {
        var verified = null;

        if (mxEvent.isEncrypted()) {
            verified = MatrixClientPeg.get().isEventSenderVerified(mxEvent);
        }

        this.setState({
            verified: verified
        });
    },

    _propsEqual: function(objA, objB) {
        var keysA = Object.keys(objA);
        var keysB = Object.keys(objB);

        if (keysA.length !== keysB.length) {
            return false;
        }

        for (var i = 0; i < keysA.length; i++) {
            var key = keysA[i];

            if (!objB.hasOwnProperty(key)) {
                return false;
            }

            // need to deep-compare readReceipts
            if (key == 'readReceipts') {
                var rA = objA[key];
                var rB = objB[key];
                if (rA === rB) {
                    continue;
                }

                if (!rA || !rB) {
                    return false;
                }

                if (rA.length !== rB.length) {
                    return false;
                }
                for (var j = 0; j < rA.length; j++) {
                    if (rA[j].userId !== rB[j].userId) {
                        return false;
                    }
                }
            } else {
                if (objA[key] !== objB[key]) {
                    return false;
                }
            }
        }
        return true;
    },

    shouldHighlight: function() {
        var actions = MatrixClientPeg.get().getPushActionsForEvent(this.props.mxEvent);
        if (!actions || !actions.tweaks) { return false; }

        // don't show self-highlights from another of our clients
        if (this.props.mxEvent.sender &&
            this.props.mxEvent.sender.userId === MatrixClientPeg.get().credentials.userId)
        {
            return false;
        }

        return actions.tweaks.highlight;
    },

    onEditClicked: function(e) {
        var MessageContextMenu = sdk.getComponent('context_menus.MessageContextMenu');
        var buttonRect = e.target.getBoundingClientRect()

        // The window X and Y offsets are to adjust position when zoomed in to page
        var x = buttonRect.right + window.pageXOffset;
        var y = (buttonRect.top + (e.target.height / 2) + window.pageYOffset) - 19;
        var self = this;
        ContextualMenu.createMenu(MessageContextMenu, {
            chevronOffset: 10,
            mxEvent: this.props.mxEvent,
            left: x,
            top: y,
            eventTileOps: this.refs.tile && this.refs.tile.getEventTileOps ? this.refs.tile.getEventTileOps() : undefined,
            onFinished: function() {
                self.setState({menu: false});
            }
        });
        this.setState({menu: true});
    },

    toggleAllReadAvatars: function() {
        this.setState({
            allReadAvatars: !this.state.allReadAvatars
        });
    },

    getReadAvatars: function() {
        var ReadReceiptMarker = sdk.getComponent('rooms.ReadReceiptMarker');
        var avatars = [];

        var left = 0;

        var receipts = this.props.readReceipts || [];
        for (var i = 0; i < receipts.length; ++i) {
            var member = receipts[i];

            var hidden = true;
            if ((i < MAX_READ_AVATARS) || this.state.allReadAvatars) {
                hidden = false;
            }

            var userId = member.userId;
            var readReceiptInfo;

            if (this.props.readReceiptMap) {
                readReceiptInfo = this.props.readReceiptMap[userId];
                if (!readReceiptInfo) {
                    readReceiptInfo = {};
                    this.props.readReceiptMap[userId] = readReceiptInfo;
                }
            }

            // add to the start so the most recent is on the end (ie. ends up rightmost)
            avatars.unshift(
                <ReadReceiptMarker key={userId} member={member}
                    leftOffset={left} hidden={hidden}
                    readReceiptInfo={readReceiptInfo}
                    checkUnmounting={this.props.checkUnmounting}
                    suppressAnimation={this._suppressReadReceiptAnimation}
                    onClick={this.toggleAllReadAvatars}
                />
            );

            // TODO: we keep the extra read avatars in the dom to make animation simpler
            // we could optimise this to reduce the dom size.
            if (!hidden) {
                left -= 15;
            }
        }
        var remText;
        if (!this.state.allReadAvatars) {
            var remainder = receipts.length - MAX_READ_AVATARS;
            if (remainder > 0) {
                remText = (
                    <div className="mx_EventTile_readAvatarRemainder"
                        onClick={this.toggleAllReadAvatars}
                        style={{left: left}}>{remainder}+
                    </div>
                );
                left -= 15;
            }
        }

        return (
            <div className="mx_EventTile_readAvatars">
                {remText}
                {avatars}
            </div>
        );
    },

    onMemberAvatarClick: function(event) {
        dispatcher.dispatch({
            action: 'view_user',
            member: this.props.mxEvent.sender,
        });
    },

    onSenderProfileClick: function(event) {
        var mxEvent = this.props.mxEvent;
        dispatcher.dispatch({
            action: 'insert_displayname',
            displayname: mxEvent.sender ? mxEvent.sender.name : mxEvent.getSender(),
        });
    },

    render: function() {
        var MessageTimestamp = sdk.getComponent('messages.MessageTimestamp');
        var SenderProfile = sdk.getComponent('messages.SenderProfile');
        var MemberAvatar = sdk.getComponent('avatars.MemberAvatar');

        //console.log("EventTile showUrlPreview for %s is %s", this.props.mxEvent.getId(), this.props.showUrlPreview);

        var content = this.props.mxEvent.getContent();
        var msgType = content.msgtype;

        var eventTileTypeName = eventTileTypes[this.props.mxEvent.getType()];
        var EventTileType = sdk.getComponent(eventTileTypeName);

        // This shouldn't happen: the caller should check we support this type
        // before trying to instantiate us
        if (!EventTileType) {
            throw new Error("Event type not supported");
        }

        var classes = classNames({
            mx_EventTile: true,
            mx_EventTile_sending: ['sending', 'queued'].indexOf(
                this.props.eventSendStatus
            ) !== -1,
            mx_EventTile_notSent: this.props.eventSendStatus == 'not_sent',
            mx_EventTile_highlight: this.shouldHighlight(),
            mx_EventTile_selected: this.props.isSelectedEvent,
            mx_EventTile_continuation: this.props.continuation,
            mx_EventTile_last: this.props.last,
            mx_EventTile_contextual: this.props.contextual,
            menu: this.state.menu,
            mx_EventTile_verified: this.state.verified === true,
            mx_EventTile_unverified: this.state.verified === false,
        });

        // Removed for now, pending discussion on it's value and complexity
        //var readAvatars = this.getReadAvatars();

        var header;

        // Only render a header if it's a leading message (without an m.emote body type)
        if (!this.props.continuation && EventTileType.needsSenderProfile() && msgType !== 'm.emote') {
            header = (
                <div className="mx_EventTile_header">
                    <div className="mx_EventTile_avatar">
                        <MemberAvatar
                            member={ this.props.mxEvent.sender }
                            width={ 27 }
                            height={ 27 }
                            onClick={ this.onMemberAvatarClick } />
                    </div>
                    <div className="mx_EventTile_sender">
                        <SenderProfile
                            onClick={this.onSenderProfileClick}
                            mxEvent={this.props.mxEvent} />
                    </div>
                </div>
            );
        }

        return (
            <div className={classes}>
                {header}
                <div className="mx_EventTile_content">
                    <div className="mx_EventTile_time">
                        <MessageTimestamp
                            ts={this.props.mxEvent.getTs()}
                            href={"#/room/" + this.props.mxEvent.getRoomId() + "/" + this.props.mxEvent.getId()} />
                    </div>
                    <div className="mx_EventTile_body">
                        <EventTileType
                            ref="tile"
                            mxEvent={this.props.mxEvent}
                            highlights={this.props.highlights}
                            highlightLink={this.props.highlightLink}
                            showUrlPreview={this.props.showUrlPreview}
                            onWidgetLoad={this.props.onWidgetLoad} />
                    </div>
                    <img className="mx_EventTile_contextButton"
                            src="img/icon-context.svg"
                            alt="Options"
                            title="Options"
                            width="21"
                            height="21"
                            onClick={this.onEditClicked} />
                </div>
                <div className="mx_EventTile_aside"></div>
            </div>
        );
    }
});
