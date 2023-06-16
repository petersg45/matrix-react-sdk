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

import { mocked, Mocked } from "jest-mock";
import { IBootstrapCrossSigningOpts } from "matrix-js-sdk/src/crypto";
import { CryptoApi, MatrixClient } from "matrix-js-sdk/src/matrix";
import { SecretStorageKeyDescriptionAesV1, ServerSideSecretStorage } from "matrix-js-sdk/src/secret-storage";
import { Device } from "matrix-js-sdk/src/models/device";

import { SdkContextClass } from "../../src/contexts/SDKContext";
import { accessSecretStorage } from "../../src/SecurityManager";
import { SetupEncryptionStore } from "../../src/stores/SetupEncryptionStore";
import { emitPromise, stubClient } from "../test-utils";

jest.mock("../../src/SecurityManager", () => ({
    accessSecretStorage: jest.fn(),
}));

describe("SetupEncryptionStore", () => {
    const cachedPassword = "p4assword";
    let client: Mocked<MatrixClient>;
    let mockCrypto: Mocked<CryptoApi>;
    let mockSecretStorage: Mocked<ServerSideSecretStorage>;
    let setupEncryptionStore: SetupEncryptionStore;

    beforeEach(() => {
        client = mocked(stubClient());
        mockCrypto = {
            bootstrapCrossSigning: jest.fn(),
            getVerificationRequestsToDeviceInProgress: jest.fn().mockReturnValue([]),
            getUserDeviceInfo: jest.fn(),
        } as unknown as Mocked<CryptoApi>;
        client.getCrypto.mockReturnValue(mockCrypto);

        mockSecretStorage = {
            isStored: jest.fn(),
        } as unknown as Mocked<ServerSideSecretStorage>;
        Object.defineProperty(client, "secretStorage", { value: mockSecretStorage });

        setupEncryptionStore = new SetupEncryptionStore();
        SdkContextClass.instance.accountPasswordStore.setPassword(cachedPassword);
    });

    afterEach(() => {
        SdkContextClass.instance.accountPasswordStore.clearPassword();
    });

    describe("start", () => {
        it("should fetch cross-signing and device info", async () => {
            const fakeKey = {} as SecretStorageKeyDescriptionAesV1;
            mockSecretStorage.isStored.mockResolvedValue({ sskeyid: fakeKey });

            const fakeDevice = new Device({ deviceId: "deviceId", userId: "", algorithms: [], keys: new Map() });
            mockCrypto.getUserDeviceInfo.mockResolvedValue(
                new Map([[client.getSafeUserId(), new Map([[fakeDevice.deviceId, fakeDevice]])]]),
            );

            setupEncryptionStore.start();
            await emitPromise(setupEncryptionStore, "update");

            // our fake device is not signed, so we can't verify against it
            expect(setupEncryptionStore.hasDevicesToVerifyAgainst).toBe(false);

            expect(setupEncryptionStore.keyId).toEqual("sskeyid");
            expect(setupEncryptionStore.keyInfo).toBe(fakeKey);
        });
    });

    it("resetConfirm should work with a cached account password", async () => {
        const makeRequest = jest.fn();
        mockCrypto.bootstrapCrossSigning.mockImplementation(async (opts: IBootstrapCrossSigningOpts) => {
            await opts?.authUploadDeviceSigningKeys?.(makeRequest);
        });
        mocked(accessSecretStorage).mockImplementation(async (func?: () => Promise<void>) => {
            await func!();
        });

        await setupEncryptionStore.resetConfirm();

        expect(mocked(accessSecretStorage)).toHaveBeenCalledWith(expect.any(Function), true);
        expect(makeRequest).toHaveBeenCalledWith({
            identifier: {
                type: "m.id.user",
                user: "@userId:matrix.org",
            },
            password: cachedPassword,
            type: "m.login.password",
            user: "@userId:matrix.org",
        });
    });
});
