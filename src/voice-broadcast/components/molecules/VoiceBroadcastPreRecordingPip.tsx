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

import React, { useRef } from "react";

import { VoiceBroadcastHeader } from "../..";
import AccessibleButton from "../../../components/views/elements/AccessibleButton";
import { VoiceBroadcastPreRecording } from "../../models/VoiceBroadcastPreRecording";
import { Icon as LiveIcon } from "../../../../res/img/element-icons/live.svg";
import { _t } from "../../../languageHandler";
import { useAudioDeviceTooltipSelection } from "../../../hooks/useAudioDeviceTooltipSelection";

interface Props {
    voiceBroadcastPreRecording: VoiceBroadcastPreRecording;
}

export const VoiceBroadcastPreRecordingPip: React.FC<Props> = ({
    voiceBroadcastPreRecording,
}) => {
    const pipRef = useRef<HTMLDivElement>(null);
    const { deviceLabel, devicesMenu, onSelectDeviceClick } = useAudioDeviceTooltipSelection(pipRef);

    return <div
        className="mx_VoiceBroadcastBody mx_VoiceBroadcastBody--pip"
        ref={pipRef}
    >
        <VoiceBroadcastHeader
            onCloseClick={voiceBroadcastPreRecording.cancel}
            onMicrophoneLineClick={onSelectDeviceClick}
            room={voiceBroadcastPreRecording.room}
            microphoneLabel={deviceLabel}
            showClose={true}
        />
        <AccessibleButton
            className="mx_VoiceBroadcastBody_blockButton"
            kind="danger"
            onClick={voiceBroadcastPreRecording.start}
        >
            <LiveIcon className="mx_Icon mx_Icon_16" />
            { _t("Go live") }
        </AccessibleButton>
        { devicesMenu }
    </div>;
};
