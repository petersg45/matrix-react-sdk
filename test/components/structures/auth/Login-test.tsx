/*
Copyright 2019, 2023 New Vector Ltd

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
import { fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { mocked, MockedObject } from "jest-mock";
import fetchMock from "fetch-mock-jest";
import { DELEGATED_OIDC_COMPATIBILITY, IdentityProviderBrand } from "matrix-js-sdk/src/@types/auth";
import { logger } from "matrix-js-sdk/src/logger";
import { createClient, MatrixClient } from "matrix-js-sdk/src/matrix";
import { OidcError } from "matrix-js-sdk/src/oidc/error";

import SdkConfig from "../../../../src/SdkConfig";
import { mkServerConfig, mockPlatformPeg, unmockPlatformPeg } from "../../../test-utils";
import Login from "../../../../src/components/structures/auth/Login";
import BasePlatform from "../../../../src/BasePlatform";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { Features } from "../../../../src/settings/Settings";
import { ValidatedDelegatedAuthConfig } from "../../../../src/utils/ValidatedServerConfig";
import * as registerClientUtils from "../../../../src/utils/oidc/registerClient";

jest.mock("matrix-js-sdk/src/matrix");

jest.useRealTimers();

const oidcStaticClientsConfig = {
    "https://staticallyregisteredissuer.org/": "static-clientId-123",
};

describe("Login", function () {
    let platform: MockedObject<BasePlatform>;

    const mockClient = mocked({
        login: jest.fn().mockResolvedValue({}),
        loginFlows: jest.fn(),
    } as unknown as MatrixClient);

    beforeEach(function () {
        SdkConfig.put({
            brand: "test-brand",
            disable_custom_urls: true,
            oidc_static_client_ids: oidcStaticClientsConfig,
        });
        mockClient.login.mockClear().mockResolvedValue({
            access_token: "TOKEN",
            device_id: "IAMADEVICE",
            user_id: "@user:server",
        });
        mockClient.loginFlows.mockClear().mockResolvedValue({ flows: [{ type: "m.login.password" }] });
        mocked(createClient).mockImplementation((opts) => {
            mockClient.idBaseUrl = opts.idBaseUrl;
            mockClient.baseUrl = opts.baseUrl;
            return mockClient;
        });
        fetchMock.resetBehavior();
        fetchMock.resetHistory();
        fetchMock.get("https://matrix.org/_matrix/client/versions", {
            unstable_features: {},
            versions: [],
        });
        platform = mockPlatformPeg({
            startSingleSignOn: jest.fn(),
        });
    });

    afterEach(function () {
        fetchMock.restore();
        SdkConfig.reset(); // we touch the config, so clean up
        unmockPlatformPeg();
    });

    function getRawComponent(
        hsUrl = "https://matrix.org",
        isUrl = "https://vector.im",
        delegatedAuthentication?: ValidatedDelegatedAuthConfig,
    ) {
        return (
            <Login
                serverConfig={mkServerConfig(hsUrl, isUrl, delegatedAuthentication)}
                onLoggedIn={() => {}}
                onRegisterClick={() => {}}
                onServerConfigChange={() => {}}
            />
        );
    }

    function getComponent(hsUrl?: string, isUrl?: string, delegatedAuthentication?: ValidatedDelegatedAuthConfig) {
        return render(getRawComponent(hsUrl, isUrl, delegatedAuthentication));
    }

    it("should show form with change server link", async () => {
        SdkConfig.put({
            brand: "test-brand",
            disable_custom_urls: false,
        });
        const { container } = getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        expect(container.querySelector("form")).toBeTruthy();

        expect(container.querySelector(".mx_ServerPicker_change")).toBeTruthy();
    });

    it("should show form without change server link when custom URLs disabled", async () => {
        const { container } = getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        expect(container.querySelector("form")).toBeTruthy();
        expect(container.querySelectorAll(".mx_ServerPicker_change")).toHaveLength(0);
    });

    it("should show SSO button if that flow is available", async () => {
        mockClient.loginFlows.mockResolvedValue({ flows: [{ type: "m.login.sso" }] });

        const { container } = getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        const ssoButton = container.querySelector(".mx_SSOButton");
        expect(ssoButton).toBeTruthy();
    });

    it("should show both SSO button and username+password if both are available", async () => {
        mockClient.loginFlows.mockResolvedValue({ flows: [{ type: "m.login.password" }, { type: "m.login.sso" }] });

        const { container } = getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        expect(container.querySelector("form")).toBeTruthy();

        const ssoButton = container.querySelector(".mx_SSOButton");
        expect(ssoButton).toBeTruthy();
    });

    it("should show multiple SSO buttons if multiple identity_providers are available", async () => {
        mockClient.loginFlows.mockResolvedValue({
            flows: [
                {
                    type: "m.login.sso",
                    identity_providers: [
                        {
                            id: "a",
                            name: "Provider 1",
                        },
                        {
                            id: "b",
                            name: "Provider 2",
                        },
                        {
                            id: "c",
                            name: "Provider 3",
                        },
                    ],
                },
            ],
        });

        const { container } = getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        const ssoButtons = container.querySelectorAll(".mx_SSOButton");
        expect(ssoButtons.length).toBe(3);
    });

    it("should show single SSO button if identity_providers is null", async () => {
        mockClient.loginFlows.mockResolvedValue({
            flows: [
                {
                    type: "m.login.sso",
                },
            ],
        });

        const { container } = getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        const ssoButtons = container.querySelectorAll(".mx_SSOButton");
        expect(ssoButtons.length).toBe(1);
    });

    it("should handle serverConfig updates correctly", async () => {
        mockClient.loginFlows.mockResolvedValue({
            flows: [
                {
                    type: "m.login.sso",
                },
            ],
        });

        const { container, rerender } = render(getRawComponent());
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        fireEvent.click(container.querySelector(".mx_SSOButton")!);
        expect(platform.startSingleSignOn.mock.calls[0][0].baseUrl).toBe("https://matrix.org");

        fetchMock.get("https://server2/_matrix/client/versions", {
            unstable_features: {},
            versions: [],
        });
        rerender(getRawComponent("https://server2"));
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        fireEvent.click(container.querySelector(".mx_SSOButton")!);
        expect(platform.startSingleSignOn.mock.calls[1][0].baseUrl).toBe("https://server2");
    });

    it("should show single Continue button if OIDC MSC3824 compatibility is given by server", async () => {
        mockClient.loginFlows.mockResolvedValue({
            flows: [
                {
                    type: "m.login.sso",
                    [DELEGATED_OIDC_COMPATIBILITY.name]: true,
                },
                {
                    type: "m.login.password",
                },
            ],
        });

        const { container } = getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        const ssoButtons = container.querySelectorAll(".mx_SSOButton");

        expect(ssoButtons.length).toBe(1);
        expect(ssoButtons[0].textContent).toBe("Continue");

        // no password form visible
        expect(container.querySelector("form")).toBeFalsy();
    });

    it("should show branded SSO buttons", async () => {
        const idpsWithIcons = Object.values(IdentityProviderBrand).map((brand) => ({
            id: brand,
            brand,
            name: `Provider ${brand}`,
        }));

        mockClient.loginFlows.mockResolvedValue({
            flows: [
                {
                    type: "m.login.sso",
                    identity_providers: [
                        ...idpsWithIcons,
                        {
                            id: "foo",
                            name: "Provider foo",
                        },
                    ],
                },
            ],
        });

        const { container } = getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        for (const idp of idpsWithIcons) {
            const ssoButton = container.querySelector(`.mx_SSOButton.mx_SSOButton_brand_${idp.brand}`);
            expect(ssoButton).toBeTruthy();
            expect(ssoButton?.querySelector(`img[alt="${idp.brand}"]`)).toBeTruthy();
        }

        const ssoButtons = container.querySelectorAll(".mx_SSOButton");
        expect(ssoButtons.length).toBe(idpsWithIcons.length + 1);
    });

    it("should display an error when homeserver doesn't offer any supported login flows", async () => {
        mockClient.loginFlows.mockResolvedValue({
            flows: [
                {
                    type: "just something weird",
                },
            ],
        });

        getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        expect(
            screen.getByText("This homeserver doesn't offer any login flows which are supported by this client."),
        ).toBeInTheDocument();
    });

    it("should display a connection error when getting login flows fails", async () => {
        mockClient.loginFlows.mockRejectedValue("oups");

        getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        expect(
            screen.getByText("There was a problem communicating with the homeserver, please try again later."),
        ).toBeInTheDocument();
    });

    it("should display an error when homeserver fails liveliness check", async () => {
        fetchMock.resetBehavior();
        fetchMock.get("https://matrix.org/_matrix/client/versions", {
            status: 400,
        });
        getComponent();
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        // error displayed
        expect(screen.getByText("Your test-brand is misconfigured")).toBeInTheDocument();
    });

    it("should reset liveliness error when server config changes", async () => {
        fetchMock.resetBehavior();
        // matrix.org is not alive
        fetchMock.get("https://matrix.org/_matrix/client/versions", {
            status: 400,
        });
        // but server2 is
        fetchMock.get("https://server2/_matrix/client/versions", {
            unstable_features: {},
            versions: [],
        });
        const { rerender } = render(getRawComponent());
        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        // error displayed
        expect(screen.getByText("Your test-brand is misconfigured")).toBeInTheDocument();

        rerender(getRawComponent("https://server2"));

        await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

        // error cleared
        expect(screen.queryByText("Your test-brand is misconfigured")).not.toBeInTheDocument();
    });

    describe("OIDC native flow", () => {
        const hsUrl = "https://matrix.org";
        const isUrl = "https://vector.im";
        const issuer = "https://test.com/";
        const delegatedAuth = {
            issuer,
            registrationEndpoint: issuer + "register",
            tokenEndpoint: issuer + "token",
            authorizationEndpoint: issuer + "authorization",
        };
        beforeEach(() => {
            jest.spyOn(logger, "error");
            jest.spyOn(SettingsStore, "getValue").mockImplementation(
                (settingName) => settingName === Features.OidcNativeFlow,
            );
        });

        afterEach(() => {
            jest.spyOn(logger, "error").mockRestore();
        });

        it("should not attempt registration when oidc native flow setting is disabled", async () => {
            jest.spyOn(SettingsStore, "getValue").mockReturnValue(false);

            getComponent(hsUrl, isUrl, delegatedAuth);

            await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

            // didn't try to register
            expect(fetchMock).not.toHaveBeenCalledWith(delegatedAuth.registrationEndpoint);
            // continued with normal setup
            expect(mockClient.loginFlows).toHaveBeenCalled();
            // normal password login rendered
            expect(screen.getByLabelText("Username")).toBeInTheDocument();
        });

        it("should attempt to register oidc client", async () => {
            // dont mock, spy so we can check config values were correctly passed
            jest.spyOn(registerClientUtils, "getOidcClientId");
            fetchMock.post(delegatedAuth.registrationEndpoint, { status: 500 });
            getComponent(hsUrl, isUrl, delegatedAuth);

            await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

            // tried to register
            expect(fetchMock).toHaveBeenCalledWith(delegatedAuth.registrationEndpoint, expect.any(Object));
            // called with values from config
            expect(registerClientUtils.getOidcClientId).toHaveBeenCalledWith(
                delegatedAuth,
                "test-brand",
                "http://localhost",
                oidcStaticClientsConfig,
            );
        });

        it("should fallback to normal login when client registration fails", async () => {
            fetchMock.post(delegatedAuth.registrationEndpoint, { status: 500 });
            getComponent(hsUrl, isUrl, delegatedAuth);

            await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

            // tried to register
            expect(fetchMock).toHaveBeenCalledWith(delegatedAuth.registrationEndpoint, expect.any(Object));
            expect(logger.error).toHaveBeenCalledWith(new Error(OidcError.DynamicRegistrationFailed));

            // continued with normal setup
            expect(mockClient.loginFlows).toHaveBeenCalled();
            // normal password login rendered
            expect(screen.getByLabelText("Username")).toBeInTheDocument();
        });

        // short term during active development, UI will be added in next PRs
        it("should show continue button when oidc native flow is correctly configured", async () => {
            fetchMock.post(delegatedAuth.registrationEndpoint, { client_id: "abc123" });
            getComponent(hsUrl, isUrl, delegatedAuth);

            await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

            // did not continue with matrix login
            expect(mockClient.loginFlows).not.toHaveBeenCalled();
            expect(screen.getByText("Continue")).toBeInTheDocument();
        });

        /**
         * Oidc-aware flows still work while the oidc-native feature flag is disabled
         */
        it("should show oidc-aware flow for oidc-enabled homeserver when oidc native flow setting is disabled", async () => {
            jest.spyOn(SettingsStore, "getValue").mockReturnValue(false);
            mockClient.loginFlows.mockResolvedValue({
                flows: [
                    {
                        type: "m.login.sso",
                        [DELEGATED_OIDC_COMPATIBILITY.name]: true,
                    },
                    {
                        type: "m.login.password",
                    },
                ],
            });

            const { container } = getComponent(hsUrl, isUrl, delegatedAuth);

            await waitForElementToBeRemoved(() => screen.queryAllByLabelText("Loading…"));

            // didn't try to register
            expect(fetchMock).not.toHaveBeenCalledWith(delegatedAuth.registrationEndpoint);
            // continued with normal setup
            expect(mockClient.loginFlows).toHaveBeenCalled();
            // oidc-aware 'continue' button displayed
            const ssoButtons = container.querySelectorAll(".mx_SSOButton");
            expect(ssoButtons.length).toBe(1);
            expect(ssoButtons[0].textContent).toBe("Continue");
            // no password form visible
            expect(container.querySelector("form")).toBeFalsy();
        });
    });
});
