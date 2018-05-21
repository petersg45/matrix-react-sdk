/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017 Vector Creations Ltd
Copyright 2017 New Vector Ltd

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

import * as Matrix from 'matrix-js-sdk';
import React from 'react';
import PropTypes from 'prop-types';
import { DragDropContext } from 'react-beautiful-dnd';

import { KeyCode, isOnlyCtrlOrCmdKeyEvent } from '../../Keyboard';
import Notifier from '../../Notifier';
import PageTypes from '../../PageTypes';
import CallMediaHandler from '../../CallMediaHandler';
import sdk from '../../index';
import dis from '../../dispatcher';
import sessionStore from '../../stores/SessionStore';
import MatrixClientPeg from '../../MatrixClientPeg';
import SettingsStore from "../../settings/SettingsStore";

import TagOrderActions from '../../actions/TagOrderActions';
import RoomListActions from '../../actions/RoomListActions';

/**
 * This is what our MatrixChat shows when we are logged in. The precise view is
 * determined by the page_type property.
 *
 * Currently it's very tightly coupled with MatrixChat. We should try to do
 * something about that.
 *
 * Components mounted below us can access the matrix client via the react context.
 */
class LoggedInView extends React.Component {
    static propTypes = {
        matrixClient: PropTypes.instanceOf(Matrix.MatrixClient).isRequired,
        page_type: PropTypes.string.isRequired,
        onRoomCreated: PropTypes.func,
        onUserSettingsClose: PropTypes.func,

        // Called with the credentials of a registered user (if they were a ROU that
        // transitioned to PWLU)
        onRegistered: PropTypes.func,

        teamToken: PropTypes.string,

        // and lots and lots of other stuff.
    };

    static childContextTypes = {
        matrixClient: PropTypes.instanceOf(Matrix.MatrixClient),
        authCache: PropTypes.object,
    };

    state = {
        // use compact timeline view
        useCompactLayout: SettingsStore.getValue('useCompactLayout'),
    };

    getChildContext() {
        return {
            matrixClient: this._matrixClient,
            authCache: {
                auth: {},
                lastUpdate: 0,
            },
        };
    }

    componentWillMount() {
        // stash the MatrixClient in case we log out before we are unmounted
        this._matrixClient = this.props.matrixClient;

        CallMediaHandler.loadDevices();

        document.addEventListener('keydown', this._onKeyDown);

        this._sessionStore = sessionStore;
        this._sessionStoreToken = this._sessionStore.addListener(
            this._setStateFromSessionStore,
        );
        this._setStateFromSessionStore();

        this._matrixClient.on("accountData", this.onAccountData);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this._onKeyDown);
        this._matrixClient.removeListener("accountData", this.onAccountData);
        if (this._sessionStoreToken) {
            this._sessionStoreToken.remove();
        }
    }

    // Child components assume that the client peg will not be null, so give them some
    // sort of assurance here by only allowing a re-render if the client is truthy.
    //
    // This is required because `LoggedInView` maintains its own state and if this state
    // updates after the client peg has been made null (during logout), then it will
    // attempt to re-render and the children will throw errors.
    shouldComponentUpdate() {
        return Boolean(MatrixClientPeg.get());
    }

    canResetTimelineInRoom = (roomId) => {
        if (!this.refs.roomView) {
            return true;
        }
        return this.refs.roomView.canResetTimeline();
    };

    _setStateFromSessionStore = () => {
        this.setState({
            userHasGeneratedPassword: Boolean(this._sessionStore.getCachedPassword()),
        });
    };

    onAccountData = (event) => {
        if (event.getType() === "im.vector.web.settings") {
            this.setState({
                useCompactLayout: event.getContent().useCompactLayout,
            });
        }
        if (event.getType() === "m.ignored_user_list") {
            dis.dispatch({action: "ignore_state_changed"});
        }
    };

    _onKeyDown = (ev) => {
            /*
            // Remove this for now as ctrl+alt = alt-gr so this breaks keyboards which rely on alt-gr for numbers
            // Will need to find a better meta key if anyone actually cares about using this.
            if (ev.altKey && ev.ctrlKey && ev.keyCode > 48 && ev.keyCode < 58) {
                dis.dispatch({
                    action: 'view_indexed_room',
                    roomIndex: ev.keyCode - 49,
                });
                ev.stopPropagation();
                ev.preventDefault();
                return;
            }
            */

        let handled = false;
        const ctrlCmdOnly = isOnlyCtrlOrCmdKeyEvent(ev);

        switch (ev.keyCode) {
            case KeyCode.UP:
            case KeyCode.DOWN:
                if (ev.altKey && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
                    const action = ev.keyCode == KeyCode.UP ?
                        'view_prev_room' : 'view_next_room';
                    dis.dispatch({action: action});
                    handled = true;
                }
                break;

            case KeyCode.PAGE_UP:
            case KeyCode.PAGE_DOWN:
                if (!ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey) {
                    this._onScrollKeyPressed(ev);
                    handled = true;
                }
                break;

            case KeyCode.HOME:
            case KeyCode.END:
                if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey) {
                    this._onScrollKeyPressed(ev);
                    handled = true;
                }
                break;
            case KeyCode.KEY_K:
                if (ctrlCmdOnly) {
                    dis.dispatch({
                        action: 'focus_room_filter',
                    });
                    handled = true;
                }
                break;
        }

        if (handled) {
            ev.stopPropagation();
            ev.preventDefault();
        }
    };

    /** dispatch a page-up/page-down/etc to the appropriate component */
    _onScrollKeyPressed = (ev) => {
        if (this.refs.roomView) {
            this.refs.roomView.handleScrollKey(ev);
        } else if (this.refs.roomDirectory) {
            this.refs.roomDirectory.handleScrollKey(ev);
        }
    };

    _onDragEnd = (result) => {
        // Dragged to an invalid destination, not onto a droppable
        if (!result.destination) {
            return;
        }

        const dest = result.destination.droppableId;

        if (dest === 'tag-panel-droppable') {
            // Could be "GroupTile +groupId:domain"
            const draggableId = result.draggableId.split(' ').pop();

            // Dispatch synchronously so that the TagPanel receives an
            // optimistic update from TagOrderStore before the previous
            // state is shown.
            dis.dispatch(TagOrderActions.moveTag(
                this._matrixClient,
                draggableId,
                result.destination.index,
            ), true);
        } else if (dest.startsWith('room-sub-list-droppable_')) {
            this._onRoomTileEndDrag(result);
        }
    };

    _onRoomTileEndDrag = (result) => {
        let newTag = result.destination.droppableId.split('_')[1];
        let prevTag = result.source.droppableId.split('_')[1];
        if (newTag === 'undefined') newTag = undefined;
        if (prevTag === 'undefined') prevTag = undefined;

        const roomId = result.draggableId.split('_')[1];

        const oldIndex = result.source.index;
        const newIndex = result.destination.index;

        dis.dispatch(RoomListActions.tagRoom(
            this._matrixClient,
            this._matrixClient.getRoom(roomId),
            prevTag, newTag,
            oldIndex, newIndex,
        ), true);
    };

    _onClick = (ev) => {
        // When the panels are disabled, clicking on them results in a mouse event
        // which bubbles to certain elements in the tree. When this happens, close
        // any settings page that is currently open (user/room/group).
        if (this.props.leftDisabled &&
            this.props.rightDisabled &&
            (
                ev.target.className === 'mx_MatrixChat' ||
                ev.target.className === 'mx_MatrixChat_middlePanel' ||
                ev.target.className === 'mx_RoomView'
            )
        ) {
            dis.dispatch({ action: 'close_settings' });
        }
    };

    render() {
        const LeftPanel = sdk.getComponent('structures.LeftPanel');
        const RightPanel = sdk.getComponent('structures.RightPanel');
        const RoomView = sdk.getComponent('structures.RoomView');
        const UserSettings = sdk.getComponent('structures.UserSettings');
        const CreateRoom = sdk.getComponent('structures.CreateRoom');
        const RoomDirectory = sdk.getComponent('structures.RoomDirectory');
        const HomePage = sdk.getComponent('structures.HomePage');
        const GroupView = sdk.getComponent('structures.GroupView');
        const MyGroups = sdk.getComponent('structures.MyGroups');
        const MatrixToolbar = sdk.getComponent('globals.MatrixToolbar');
        const CookieBar = sdk.getComponent('globals.CookieBar');
        const NewVersionBar = sdk.getComponent('globals.NewVersionBar');
        const UpdateCheckBar = sdk.getComponent('globals.UpdateCheckBar');
        const PasswordNagBar = sdk.getComponent('globals.PasswordNagBar');

        let page_element;
        let right_panel = '';

        switch (this.props.page_type) {
            case PageTypes.RoomView:
                page_element = <RoomView
                        ref='roomView'
                        autoJoin={this.props.autoJoin}
                        onRegistered={this.props.onRegistered}
                        thirdPartyInvite={this.props.thirdPartyInvite}
                        oobData={this.props.roomOobData}
                        eventPixelOffset={this.props.initialEventPixelOffset}
                        key={this.props.currentRoomId || 'roomview'}
                        disabled={this.props.middleDisabled}
                        collapsedRhs={this.props.collapseRhs}
                        ConferenceHandler={this.props.ConferenceHandler}
                    />;
                if (!this.props.collapseRhs) {
                    right_panel = <RightPanel roomId={this.props.currentRoomId} disabled={this.props.rightDisabled} />;
                }
                break;

            case PageTypes.UserSettings:
                page_element = <UserSettings
                    onClose={this.props.onCloseAllSettings}
                    brand={this.props.config.brand}
                    referralBaseUrl={this.props.config.referralBaseUrl}
                    teamToken={this.props.teamToken}
                />;
                if (!this.props.collapseRhs) right_panel = <RightPanel disabled={this.props.rightDisabled} />;
                break;

            case PageTypes.MyGroups:
                page_element = <MyGroups />;
                break;

            case PageTypes.CreateRoom:
                page_element = <CreateRoom
                    onRoomCreated={this.props.onRoomCreated}
                    collapsedRhs={this.props.collapseRhs}
                />;
                if (!this.props.collapseRhs) right_panel = <RightPanel disabled={this.props.rightDisabled} />;
                break;

            case PageTypes.RoomDirectory:
                page_element = <RoomDirectory
                    ref="roomDirectory"
                    config={this.props.config.roomDirectory}
                />;
                break;

            case PageTypes.HomePage:
                {
                    // If team server config is present, pass the teamServerURL. props.teamToken
                    // must also be set for the team page to be displayed, otherwise the
                    // welcomePageUrl is used (which might be undefined).
                    const teamServerUrl = this.props.config.teamServerConfig ?
                        this.props.config.teamServerConfig.teamServerURL : null;

                    page_element = <HomePage
                        teamServerUrl={teamServerUrl}
                        teamToken={this.props.teamToken}
                        homePageUrl={this.props.config.welcomePageUrl}
                    />;
                }
                break;

            case PageTypes.UserView:
                page_element = null; // deliberately null for now
                right_panel = <RightPanel disabled={this.props.rightDisabled} />;
                break;
            case PageTypes.GroupView:
                page_element = <GroupView
                    groupId={this.props.currentGroupId}
                    isNew={this.props.currentGroupIsNew}
                    collapsedRhs={this.props.collapseRhs}
                />;
                if (!this.props.collapseRhs) right_panel = <RightPanel groupId={this.props.currentGroupId} disabled={this.props.rightDisabled} />;
                break;
        }

        let topBar;
        const isGuest = this.props.matrixClient.isGuest();
        if (this.props.showCookieBar &&
            this.props.config.piwik
        ) {
            const policyUrl = this.props.config.piwik.policyUrl || null;
            topBar = <CookieBar policyUrl={policyUrl} />;
        } else if (this.props.hasNewVersion) {
            topBar = <NewVersionBar version={this.props.version} newVersion={this.props.newVersion}
                                    releaseNotes={this.props.newVersionReleaseNotes}
            />;
        } else if (this.props.checkingForUpdate) {
            topBar = <UpdateCheckBar {...this.props.checkingForUpdate} />;
        } else if (this.state.userHasGeneratedPassword) {
            topBar = <PasswordNagBar />;
        } else if (!isGuest && Notifier.supportsDesktopNotifications() && !Notifier.isEnabled() && !Notifier.isToolbarHidden()) {
            topBar = <MatrixToolbar />;
        }

        let bodyClasses = 'mx_MatrixChat';
        if (topBar) {
            bodyClasses += ' mx_MatrixChat_toolbarShowing';
        }
        if (this.state.useCompactLayout) {
            bodyClasses += ' mx_MatrixChat_useCompactLayout';
        }

        return (
            <div className='mx_MatrixChat_wrapper' aria-hidden={this.props.hideToSRUsers} onClick={this._onClick}>
                { topBar }
                <DragDropContext onDragEnd={this._onDragEnd}>
                    <div className={bodyClasses}>
                        <LeftPanel
                            collapsed={this.props.collapseLhs || false}
                            disabled={this.props.leftDisabled}
                        />
                        <main className='mx_MatrixChat_middlePanel'>
                            { page_element }
                        </main>
                        { right_panel }
                    </div>
                </DragDropContext>
            </div>
        );
    }
}

export default LoggedInView;
