/*
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

import React from 'react';
import PropTypes from 'prop-types';
import sdk from '../../../index';
import dis from '../../../dispatcher';
import { GroupMemberType } from '../../../groups';
import withMatrixClient from '../../../wrappers/withMatrixClient';

export default withMatrixClient(class extends React.Component {
    static displayName = 'GroupMemberTile';

    static propTypes = {
        matrixClient: PropTypes.object,
        groupId: PropTypes.string.isRequired,
        member: GroupMemberType.isRequired,
    };

    state = {};

    onClick = (e) => {
        dis.dispatch({
            action: 'view_group_user',
            member: this.props.member,
            groupId: this.props.groupId,
        });
    };

    render() {
        const BaseAvatar = sdk.getComponent('avatars.BaseAvatar');
        const EntityTile = sdk.getComponent('rooms.EntityTile');

        const name = this.props.member.displayname || this.props.member.userId;
        const avatarUrl = this.props.matrixClient.mxcUrlToHttp(
            this.props.member.avatarUrl,
            36, 36, 'crop',
        );

        const av = (
            <BaseAvatar name={this.props.member.userId}
                width={36} height={36}
                url={avatarUrl}
            />
        );

        return (
            <EntityTile name={name} avatarJsx={av} onClick={this.onClick}
                suppressOnHover={true} presenceState="online"
                powerStatus={this.props.member.isPrivileged ? EntityTile.POWER_STATUS_ADMIN : null}
            />
        );
    }
});
