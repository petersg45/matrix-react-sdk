/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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
import maplibregl from 'maplibre-gl';
import SdkConfig from '../../../SdkConfig';
import { replaceableComponent } from "../../../utils/replaceableComponent";
import { IBodyProps } from "./IBodyProps";
import { LocationShareType } from "../location/LocationShareType";

interface IState {
}

@replaceableComponent("views.messages.MLocationBody")
export default class MLocationBody extends React.Component<IBodyProps, IState> {
    private map : maplibregl.Map;
    private coords : GeolocationCoordinates;

    constructor(props: IBodyProps) {
        super(props);

        // unfortunately we're stuck supporting legacy `content.geo_uri`
        // events until the end of days, or until we figure out mutable
        // events - so folks can read their old chat history correctly.
        // https://github.com/matrix-org/matrix-doc/issues/3516
        const content = this.props.mxEvent.getContent();
        const uri = content['org.matrix.msc3488.location'] ?
            content['org.matrix.msc3488.location'].uri :
            content['geo_uri'];

        this.coords = this.parseGeoUri(uri);
    }

    private parseGeoUri = (uri: string) : GeolocationCoordinates => {
        const m = uri.match(/^\s*geo:(.*?)\s*$/);
        if (!m) return;
        const parts = m[1].split(';');
        const coords = parts[0].split(',');
        let uncertainty : number;
        for (const param of parts.slice(1)) {
            const m = param.match(/u=(.*)/);
            if (m) uncertainty = parseFloat(m[1]);
        }
        return {
            latitude: parseFloat(coords[0]),
            longitude: parseFloat(coords[1]),
            altitude: parseFloat(coords[2]),
            accuracy: uncertainty,
            altitudeAccuracy: undefined,
            heading: undefined,
            speed: undefined,
        };
    };

    componentDidMount() {
        const config = SdkConfig.get();
        this.map = new maplibregl.Map({
            container: this.getBodyId(),
            style: config.map_style_url,
            center: [this.coords.longitude, this.coords.latitude],
            zoom: 13,
        });

        new maplibregl.Marker()
            .setLngLat([this.coords.longitude, this.coords.latitude])
            .addTo(this.map);
    }

    private getBodyId = () => {
        return `mx_MLocationBody_${this.props.mxEvent.getId()}`;
    };

    render() {
        return <div id={this.getBodyId()} className="mx_MLocationBody" />;
    }
}
