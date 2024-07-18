/*
Copyright 2024 The Matrix.org Foundation C.I.C.

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

import { logger } from "matrix-js-sdk/src/logger";
import { Crypto } from "matrix-js-sdk/src/matrix";

import { MatrixClientPeg } from "../../MatrixClientPeg";

/**
 * Check if device dehydration is enabled.
 *
 * Note that this doesn't necessarily mean that device dehydration has been initialised
 * (yet) on this client; rather, it means that the server supports it, the crypto backend
 * supports it, and the application configuration suggests that it *should* be
 * initialised on this device.
 *
 * Dehydration can currently only be enabled by setting a flag in the .well-known file.
 */
async function deviceDehydrationEnabled(crypto: Crypto.CryptoApi | undefined): Promise<boolean> {
    if (!crypto) {
        return false;
    }
    if (!(await crypto.isDehydrationSupported())) {
        return false;
    }
    const wellknown = await MatrixClientPeg.safeGet().waitForClientWellKnown();
    return !!wellknown?.["org.matrix.msc3814"];
}

/**
 * If dehydration is enabled (i.e., it is supported by the server and enabled in
 * the configuration), rehydrate a device (if available) and create
 * a new dehydrated device.
 *
 * @param createNewKey: force a new dehydration key to be created, even if one
 *   already exists.  This is used when we reset secret storage.
 */
export async function initialiseDehydration(createNewKey: boolean = false): Promise<void> {
    const crypto = MatrixClientPeg.safeGet().getCrypto();
    if (await deviceDehydrationEnabled(crypto)) {
        logger.log("Device dehydration enabled");
        await crypto!.startDehydration(createNewKey);
    }
}
