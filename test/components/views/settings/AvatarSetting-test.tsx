/*
Copyright 2023 The Matrix.org Foundation C.I.C.

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
import React from "react";
import { render, screen } from "@testing-library/react";

import AvatarSetting from "../../../../src/components/views/settings/AvatarSetting";
import { stubClient } from "../../../test-utils";

const BASE64_GIF = "R0lGODlhAQABAAAAACw=";

describe("<AvatarSetting />", () => {
    beforeEach(() => {
        stubClient();
    });

    it("renders avatar with specified alt text", async () => {
        const { queryByAltText } = render(
            <AvatarSetting avatarAltText="Avatar of Peter Fox" avatar="https://avatar.fictional/my-avatar" />,
        );

        const imgElement = queryByAltText("Avatar of Peter Fox");
        expect(imgElement).toBeInTheDocument();
    });

    it("renders avatar with remove button", async () => {
        const { queryByText } = render(
            <AvatarSetting
                avatarAltText="Avatar of Peter Fox"
                avatar="https://avatar.fictional/my-avatar"
                removeAvatar={jest.fn()}
            />,
        );

        const removeButton = queryByText("Remove");
        expect(removeButton).toBeInTheDocument();
    });

    it("renders avatar without remove button", async () => {
        const { queryByText } = render(<AvatarSetting disabled={true} avatarAltText="Avatar of Peter Fox" />);

        const removeButton = queryByText("Remove");
        expect(removeButton).toBeNull();
    });

    it("render a file as the avatar when supplied", async () => {
        const imgData = Uint8Array.from(atob(BASE64_GIF), (c) => c.charCodeAt(0));

        render(
            <AvatarSetting
                avatarAltText="Avatar of Peter Fox"
                avatar={new File([imgData], "avatar.png", { type: "image/gif" })}
            />,
        );

        const imgElement = await screen.findByRole("button", { name: "Avatar of Peter Fox" });
        expect(imgElement).toBeInTheDocument();
        expect(imgElement).toHaveAttribute("src", "data:image/gif;base64," + BASE64_GIF);
    });
});
