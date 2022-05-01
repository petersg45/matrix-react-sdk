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

import { createMapSiteLink } from "../../../src/utils/location";
import { mkMessage } from "../../test-utils";
import { makeLegacyLocationEvent, makeLocationEvent } from "../../test-utils/location";

describe("createMapSiteLink", () => {
    it("returns null if event does not contain geouri", () => {
        expect(createMapSiteLink(mkMessage({
            room: '1', user: '@sender:server', event: true,
        }))).toBeNull();
    });

    it("returns OpenStreetMap link if event contains m.location", () => {
        expect(
            createMapSiteLink(makeLocationEvent("geo:51.5076,-0.1276")),
        ).toEqual(
            "https://www.openstreetmap.org/" +
            "?mlat=51.5076&mlon=-0.1276" +
            "#map=16/51.5076/-0.1276",
        );
    });

    it("returns OpenStreetMap link if event contains geo_uri", () => {
        expect(
            createMapSiteLink(makeLegacyLocationEvent("geo:51.5076,-0.1276")),
        ).toEqual(
            "https://www.openstreetmap.org/" +
            "?mlat=51.5076&mlon=-0.1276" +
            "#map=16/51.5076/-0.1276",
        );
    });
});
