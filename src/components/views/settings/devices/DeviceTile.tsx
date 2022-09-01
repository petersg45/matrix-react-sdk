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

import React, { Fragment } from "react";
<<<<<<< HEAD
import { IMyDevice } from "matrix-js-sdk/src/matrix";

=======

import { Icon as InactiveIcon } from '../../../../../res/img/element-icons/settings/inactive.svg';
>>>>>>> upstream/develop
import { _t } from "../../../../languageHandler";
import { formatDate, formatRelativeTime } from "../../../../DateUtils";
import TooltipTarget from "../../elements/TooltipTarget";
import { Alignment } from "../../elements/Tooltip";
import Heading from "../../typography/Heading";
<<<<<<< HEAD

export interface DeviceTileProps {
    device: IMyDevice;
=======
import { INACTIVE_DEVICE_AGE_DAYS, isDeviceInactive } from "./filter";
import { DeviceWithVerification } from "./types";
import { DeviceType } from "./DeviceType";
export interface DeviceTileProps {
    device: DeviceWithVerification;
>>>>>>> upstream/develop
    children?: React.ReactNode;
    onClick?: () => void;
}

<<<<<<< HEAD
const DeviceTileName: React.FC<{ device: IMyDevice }> = ({ device }) => {
=======
const DeviceTileName: React.FC<{ device: DeviceWithVerification }> = ({ device }) => {
>>>>>>> upstream/develop
    if (device.display_name) {
        return <TooltipTarget
            alignment={Alignment.Top}
            label={`${device.display_name} (${device.device_id})`}
        >
            <Heading size='h4'>
                { device.display_name }
            </Heading>
        </TooltipTarget>;
    }
    return <Heading size='h4'>
        { device.device_id }
    </Heading>;
};

<<<<<<< HEAD
const MS_6_DAYS = 6 * 24 * 60 * 60 * 1000;
=======
const MS_DAY = 24 * 60 * 60 * 1000;
const MS_6_DAYS = 6 * MS_DAY;
>>>>>>> upstream/develop
const formatLastActivity = (timestamp: number, now = new Date().getTime()): string => {
    // less than a week ago
    if (timestamp + MS_6_DAYS >= now) {
        const date = new Date(timestamp);
        // Tue 20:15
        return formatDate(date);
    }
    return formatRelativeTime(new Date(timestamp));
};

<<<<<<< HEAD
const DeviceMetadata: React.FC<{ value: string, id: string }> = ({ value, id }) => (
=======
const getInactiveMetadata = (device: DeviceWithVerification): { id: string, value: React.ReactNode } | undefined => {
    const isInactive = isDeviceInactive(device);

    if (!isInactive) {
        return undefined;
    }
    return { id: 'inactive', value: (
        <>
            <InactiveIcon className="mx_DeviceTile_inactiveIcon" />
            {
                _t('Inactive for %(inactiveAgeDays)s+ days', { inactiveAgeDays: INACTIVE_DEVICE_AGE_DAYS }) +
                ` (${formatLastActivity(device.last_seen_ts)})`
            }
        </>),
    };
};

const DeviceMetadata: React.FC<{ value: string | React.ReactNode, id: string }> = ({ value, id }) => (
>>>>>>> upstream/develop
    value ? <span data-testid={`device-metadata-${id}`}>{ value }</span> : null
);

const DeviceTile: React.FC<DeviceTileProps> = ({ device, children, onClick }) => {
<<<<<<< HEAD
    const lastActivity = device.last_seen_ts && `${_t('Last activity')} ${formatLastActivity(device.last_seen_ts)}`;
    const metadata = [
        { id: 'lastActivity', value: lastActivity },
        { id: 'lastSeenIp', value: device.last_seen_ip },
    ];

    return <div className="mx_DeviceTile">
=======
    const inactive = getInactiveMetadata(device);
    const lastActivity = device.last_seen_ts && `${_t('Last activity')} ${formatLastActivity(device.last_seen_ts)}`;
    const verificationStatus = device.isVerified ? _t('Verified') : _t('Unverified');
    // if device is inactive, don't display last activity or verificationStatus
    const metadata = inactive
        ? [inactive, { id: 'lastSeenIp', value: device.last_seen_ip }]
        : [
            { id: 'isVerified', value: verificationStatus },
            { id: 'lastActivity', value: lastActivity },
            { id: 'lastSeenIp', value: device.last_seen_ip },
        ];

    return <div className="mx_DeviceTile" data-testid={`device-tile-${device.device_id}`}>
        <DeviceType isVerified={device.isVerified} />
>>>>>>> upstream/develop
        <div className="mx_DeviceTile_info" onClick={onClick}>
            <DeviceTileName device={device} />
            <div className="mx_DeviceTile_metadata">
                { metadata.map(({ id, value }, index) =>
                    <Fragment key={id}>
                        { !!index && ' · ' }
                        <DeviceMetadata id={id} value={value} />
                    </Fragment>,
                ) }
            </div>
        </div>
        <div className="mx_DeviceTile_actions">
            { children }
        </div>
    </div>;
};

export default DeviceTile;
