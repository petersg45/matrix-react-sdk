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

import { _t } from '../../../../languageHandler';
import { MatrixClientPeg } from '../../../../MatrixClientPeg';
import SdkConfig from '../../../../SdkConfig';
import AccessibleButton from '../../elements/AccessibleButton';
import SettingsSubsection from '../shared/SettingsSubsection';

interface IProps {
    onShowQr: () => void;
    onScanQr: () => void;
}

interface IState {
    msc3882Supported: boolean | null;
    msc3886Supported: boolean | null;
}

export default class LoginWithQRSection extends React.Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            msc3882Supported: null,
            msc3886Supported: null,
        };
    }

    public componentDidMount(): void {
        MatrixClientPeg.get().doesServerSupportUnstableFeature("org.matrix.msc3882"). then((msc3882Supported) => {
            this.setState({ msc3882Supported });
        });
        MatrixClientPeg.get().doesServerSupportUnstableFeature("org.matrix.msc3886").then((msc3886Supported) => {
            this.setState({ msc3886Supported });
        });
    }

    public render(): JSX.Element {
        const features = SdkConfig.get().login_with_qr?.reciprocate;

        // Needs to be enabled as a feature + server support MSC3882:
        const offerScanQr = features.enable_scanning && this.state.msc3882Supported;

        // Needs to be enabled as a feature + server support MSC3886 or have a default rendezvous server configured:
        const offerShowQr = features.enable_showing && this.state.msc3882Supported &&
            (this.state.msc3886Supported || !!SdkConfig.get().login_with_qr?.fallback_http_transport_server);

        // don't show anything if no method is available
        if (!offerScanQr && !offerShowQr) {
            return null;
        }

        let description: string;

        if (offerScanQr && offerShowQr) {
            description = _t("You can use this device to sign in a new device with a QR code. There are two ways " +
            "to do this:");
        } else if (offerScanQr) {
            description = _t("You can use this device to sign in a new device with a QR code. You will need to " +
            "use this device to scan the QR code shown on your other device that's signed out.");
        } else {
            description = _t("You can use this device to sign in a new device with a QR code. You will need to " +
            "scan the QR code shown on this device with your device that's signed out.");
        }

        return <SettingsSubsection
            heading={_t('Sign in with QR code')}
        >
            <div className="mx_LoginWithQRSection">
                <p className="mx_SettingsTab_subsectionText">{ description }</p>
                { offerScanQr && <AccessibleButton
                    onClick={this.props.onScanQr}
                    kind="primary"
                >{ _t("Scan QR code") }</AccessibleButton> }
                { offerShowQr && <AccessibleButton
                    onClick={this.props.onShowQr}
                    kind={features.enable_scanning ? "primary_outline" : "primary"}
                >{ _t("Show QR code") }</AccessibleButton> }
            </div>
        </SettingsSubsection>;
    }
}
