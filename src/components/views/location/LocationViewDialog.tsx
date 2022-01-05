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
import { MatrixEvent } from 'matrix-js-sdk/src/models/event';

import { replaceableComponent } from "../../../utils/replaceableComponent";
import { _t } from '../../../languageHandler';
import BaseDialog from "../dialogs/BaseDialog";
import { IDialogProps } from "../dialogs/IDialogProps";
import { createMap, LocationBodyContent, locationEventGeoUri, parseGeoUri } from '../messages/MLocationBody';

interface IProps extends IDialogProps {
    mxEvent: MatrixEvent;
}

interface IState {
    error: Error;
}

@replaceableComponent("views.location.LocationViewDialog")
export default class LocationViewDialog extends React.Component<IProps, IState> {
    private coords: GeolocationCoordinates;

    constructor(props: IProps) {
        super(props);

        this.coords = parseGeoUri(locationEventGeoUri(this.props.mxEvent));
        this.state = {
            error: undefined,
        };
    }

    componentDidMount() {
        if (this.state.error) {
            return;
        }

        createMap(
            this.coords,
            true,
            this.getBodyId(),
            this.getMarkerId(),
            (e: Error) => this.setState({ error: e }),
        );

        // Set class mx_Dialog_nonDialogButton on all buttons inside
        // the map container. This prevents our CSS from styling the
        // attribution button as if it were a dialog submit/cancel button.
        const container: Element = document.getElementById(this.getBodyId());
        container.querySelectorAll("button").forEach(
            (b: Element) => b.classList.add("mx_Dialog_nonDialogButton")
        );
    }

    private getBodyId = () => {
        return `mx_LocationViewDialog_${this.props.mxEvent.getId()}`;
    };

    private getMarkerId = () => {
        return `mx_MLocationViewDialog_marker_${this.props.mxEvent.getId()}`;
    };

    render() {
        return (
            <BaseDialog
                className='mx_LocationViewDialog'
                onFinished={this.props.onFinished}
                fixedWidth={false}
            >
                <LocationBodyContent
                    mxEvent={this.props.mxEvent}
                    bodyId={this.getBodyId()}
                    markerId={this.getMarkerId()}
                    error={this.state.error}
                />
            </BaseDialog>
        );
    }
}
