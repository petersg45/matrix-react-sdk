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

import React from 'react';

import { _t } from "../../../../../languageHandler";
import Spinner from '../../../elements/Spinner';
import { useOwnDevices } from '../../devices/useOwnDevices';
import DeviceTile from '../../devices/DeviceTile';
import SettingsSubsection from '../../shared/SettingsSubsection';
import SettingsTab from '../SettingsTab';

const SessionManagerTab: React.FC = () => {
    const { devices, currentDeviceId, isLoading } = useOwnDevices();

    const currentDevice = devices[currentDeviceId];
    return <SettingsTab heading={_t('Sessions')}>
        <SettingsSubsection
            heading={_t('Current session')}
            data-testid='current-session-section'
        >
            { isLoading && <Spinner /> }
            { !!currentDevice && <DeviceTile
                device={currentDevice}
            /> }
        </SettingsSubsection>
    </SettingsTab>;
};

export default SessionManagerTab;
