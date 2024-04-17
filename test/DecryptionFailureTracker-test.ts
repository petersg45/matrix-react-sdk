/*
Copyright 2018 New Vector Ltd

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
import { CryptoEvent } from "matrix-js-sdk/src/matrix";
import { decryptExistingEvent, mkDecryptionFailureMatrixEvent } from "matrix-js-sdk/src/testing";
import { CryptoApi, DecryptionFailureCode, UserVerificationStatus } from "matrix-js-sdk/src/crypto-api";
import { sleep } from "matrix-js-sdk/src/utils";

import { DecryptionFailureTracker, ErrorProperties } from "../src/DecryptionFailureTracker";
import { stubClient } from "./test-utils";

async function createFailedDecryptionEvent(opts: { sender?: string; code?: DecryptionFailureCode } = {}) {
    return await mkDecryptionFailureMatrixEvent({
        roomId: "!room:id",
        sender: opts.sender ?? "@alice:example.com",
        code: opts.code ?? DecryptionFailureCode.UNKNOWN_ERROR,
        msg: ":(",
    });
}

describe("DecryptionFailureTracker", function () {
    it("tracks a failed decryption for a visible event", async function () {
        const failedDecryptionEvent = await createFailedDecryptionEvent();

        let count = 0;
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            () => count++,
            () => "UnknownError",
        );

        tracker.addVisibleEvent(failedDecryptionEvent);
        tracker.eventDecrypted(failedDecryptionEvent, Date.now());

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        // Immediately track the newest failures
        tracker.trackFailures();

        // should track a failure for an event that failed decryption
        expect(count).not.toBe(0);
    });

    it("tracks a failed decryption with expected raw error for a visible event", async function () {
        const failedDecryptionEvent = await createFailedDecryptionEvent({
            code: DecryptionFailureCode.OLM_UNKNOWN_MESSAGE_INDEX,
        });

        let count = 0;
        let reportedRawCode = "";
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            (_errCode: string, rawCode: string) => {
                count++;
                reportedRawCode = rawCode;
            },
            () => "UnknownError",
        );

        tracker.addVisibleEvent(failedDecryptionEvent);
        tracker.eventDecrypted(failedDecryptionEvent, Date.now());

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        // Immediately track the newest failures
        tracker.trackFailures();

        // should track a failure for an event that failed decryption
        expect(count).not.toBe(0);

        // Should add the rawCode to the event context
        expect(reportedRawCode).toBe("OLM_UNKNOWN_MESSAGE_INDEX");
    });

    it("tracks a failed decryption for an event that becomes visible later", async function () {
        const failedDecryptionEvent = await createFailedDecryptionEvent();

        let count = 0;
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            () => count++,
            () => "UnknownError",
        );

        tracker.eventDecrypted(failedDecryptionEvent, Date.now());
        tracker.addVisibleEvent(failedDecryptionEvent);

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        // Immediately track the newest failures
        tracker.trackFailures();

        // should track a failure for an event that failed decryption
        expect(count).not.toBe(0);
    });

    it("tracks visible vs. not visible events", async () => {
        const propertiesByErrorCode: Record<string, ErrorProperties> = {};
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            (errorCode: string, rawError: string, properties: ErrorProperties) => {
                propertiesByErrorCode[errorCode] = properties;
            },
            (error: string) => error,
        );

        // use three different errors so that we can distinguish the reports
        const error1 = DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID;
        const error2 = DecryptionFailureCode.MEGOLM_BAD_ROOM;
        const error3 = DecryptionFailureCode.MEGOLM_MISSING_FIELDS;

        // event that will be marked as visible before it's marked as undecryptable
        const markedVisibleFirst = await createFailedDecryptionEvent({ code: error1 });
        // event that will be marked as undecryptable before it's marked as visible
        const markedUndecryptableFirst = await createFailedDecryptionEvent({ code: error2 });
        // event that is never marked as visible
        const neverVisible = await createFailedDecryptionEvent({ code: error3 });

        tracker.addVisibleEvent(markedVisibleFirst);

        const now = Date.now();
        tracker.eventDecrypted(markedVisibleFirst, now);
        tracker.eventDecrypted(markedUndecryptableFirst, now);
        tracker.eventDecrypted(neverVisible, now);

        tracker.addVisibleEvent(markedUndecryptableFirst);

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        tracker.trackFailures();

        expect(propertiesByErrorCode[error1].wasVisibleToUser).toBe(true);
        expect(propertiesByErrorCode[error2].wasVisibleToUser).toBe(true);
        expect(propertiesByErrorCode[error3].wasVisibleToUser).toBe(false);
    });

    it("does not track a failed decryption where the event is subsequently successfully decrypted", async () => {
        const decryptedEvent = await createFailedDecryptionEvent();
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            () => {
                // should not track an event that has since been decrypted correctly
                expect(true).toBe(false);
            },
            () => "UnknownError",
        );

        tracker.addVisibleEvent(decryptedEvent);
        tracker.eventDecrypted(decryptedEvent, Date.now());

        // Indicate successful decryption.
        await decryptExistingEvent(decryptedEvent, {
            plainType: "m.room.message",
            plainContent: { body: "success" },
        });
        tracker.eventDecrypted(decryptedEvent, null, Date.now());

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        // Immediately track the newest failures
        tracker.trackFailures();
    });

    it(
        "does not track a failed decryption where the event is subsequently successfully decrypted " +
            "and later becomes visible",
        async () => {
            const decryptedEvent = await createFailedDecryptionEvent();
            // @ts-ignore access to private constructor
            const tracker = new DecryptionFailureTracker(
                () => {
                    // should not track an event that has since been decrypted correctly
                    expect(true).toBe(false);
                },
                () => "UnknownError",
            );

            tracker.eventDecrypted(decryptedEvent, Date.now());

            // Indicate successful decryption.
            await decryptExistingEvent(decryptedEvent, {
                plainType: "m.room.message",
                plainContent: { body: "success" },
            });
            tracker.eventDecrypted(decryptedEvent, Date.now());

            tracker.addVisibleEvent(decryptedEvent);

            // Pretend "now" is Infinity
            tracker.checkFailures(Infinity);

            // Immediately track the newest failures
            tracker.trackFailures();
        },
    );

    it("only tracks a single failure per event, despite multiple failed decryptions for multiple events", async () => {
        const decryptedEvent = await createFailedDecryptionEvent();
        const decryptedEvent2 = await createFailedDecryptionEvent();

        let count = 0;
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            () => count++,
            () => "UnknownError",
        );

        tracker.addVisibleEvent(decryptedEvent);

        // Arbitrary number of failed decryptions for both events
        const now = Date.now();
        tracker.eventDecrypted(decryptedEvent, now);
        tracker.eventDecrypted(decryptedEvent, now);
        tracker.eventDecrypted(decryptedEvent, now);
        tracker.eventDecrypted(decryptedEvent, now);
        tracker.eventDecrypted(decryptedEvent, now);
        tracker.eventDecrypted(decryptedEvent2, now);
        tracker.eventDecrypted(decryptedEvent2, now);
        tracker.addVisibleEvent(decryptedEvent2);
        tracker.eventDecrypted(decryptedEvent2, now);

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        // Simulated polling of `trackFailures`, an arbitrary number ( > 2 ) times
        tracker.trackFailures();
        tracker.trackFailures();
        tracker.trackFailures();
        tracker.trackFailures();

        // should only track a single failure per event
        expect(count).toBe(2);
    });

    it("should not track a failure for an event that was tracked previously", async () => {
        const decryptedEvent = await createFailedDecryptionEvent();

        let count = 0;
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            () => count++,
            () => "UnknownError",
        );

        tracker.addVisibleEvent(decryptedEvent);

        // Indicate decryption
        tracker.eventDecrypted(decryptedEvent, Date.now());

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        tracker.trackFailures();

        // Indicate a second decryption, after having tracked the failure
        tracker.eventDecrypted(decryptedEvent, Date.now());

        tracker.trackFailures();

        // should only track a single failure per event
        expect(count).toBe(1);
    });

    it.skip("should not track a failure for an event that was tracked in a previous session", async () => {
        // This test uses localStorage, clear it beforehand
        localStorage.clear();

        const decryptedEvent = await createFailedDecryptionEvent();

        let count = 0;
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            () => count++,
            () => "UnknownError",
        );

        tracker.addVisibleEvent(decryptedEvent);

        // Indicate decryption
        tracker.eventDecrypted(decryptedEvent, Date.now());

        // Pretend "now" is Infinity
        // NB: This saves to localStorage specific to DFT
        tracker.checkFailures(Infinity);

        tracker.trackFailures();

        // Simulate the browser refreshing by destroying tracker and creating a new tracker
        // @ts-ignore access to private constructor
        const secondTracker = new DecryptionFailureTracker(
            (total: number) => (count += total),
            () => "UnknownError",
        );

        secondTracker.addVisibleEvent(decryptedEvent);

        //secondTracker.loadTrackedEvents();

        secondTracker.eventDecrypted(decryptedEvent, Date.now());
        secondTracker.checkFailures(Infinity);
        secondTracker.trackFailures();

        // should only track a single failure per event
        expect(count).toBe(1);
    });

    it("should count different error codes separately for multiple failures with different error codes", async () => {
        const counts: Record<string, number> = {};

        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            (errorCode: string) => (counts[errorCode] = (counts[errorCode] || 0) + 1),
            (error: DecryptionFailureCode) =>
                error === DecryptionFailureCode.UNKNOWN_ERROR ? "UnknownError" : "OlmKeysNotSentError",
        );

        const decryptedEvent1 = await createFailedDecryptionEvent({
            code: DecryptionFailureCode.UNKNOWN_ERROR,
        });
        const decryptedEvent2 = await createFailedDecryptionEvent({
            code: DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID,
        });
        const decryptedEvent3 = await createFailedDecryptionEvent({
            code: DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID,
        });

        tracker.addVisibleEvent(decryptedEvent1);
        tracker.addVisibleEvent(decryptedEvent2);
        tracker.addVisibleEvent(decryptedEvent3);

        // One failure of UNKNOWN_ERROR, and effectively two for MEGOLM_UNKNOWN_INBOUND_SESSION_ID
        const now = Date.now();
        tracker.eventDecrypted(decryptedEvent1, now);
        tracker.eventDecrypted(decryptedEvent2, now);
        tracker.eventDecrypted(decryptedEvent2, now);
        tracker.eventDecrypted(decryptedEvent3, now);

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        tracker.trackFailures();

        //expect(counts['UnknownError']).toBe(1, 'should track one UnknownError');
        expect(counts["OlmKeysNotSentError"]).toBe(2);
    });

    it("should aggregate error codes correctly", async () => {
        const counts: Record<string, number> = {};

        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            (errorCode: string) => (counts[errorCode] = (counts[errorCode] || 0) + 1),
            (_errorCode: string) => "OlmUnspecifiedError",
        );

        const decryptedEvent1 = await createFailedDecryptionEvent({
            code: DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID,
        });
        const decryptedEvent2 = await createFailedDecryptionEvent({
            code: DecryptionFailureCode.OLM_UNKNOWN_MESSAGE_INDEX,
        });
        const decryptedEvent3 = await createFailedDecryptionEvent({
            code: DecryptionFailureCode.UNKNOWN_ERROR,
        });

        tracker.addVisibleEvent(decryptedEvent1);
        tracker.addVisibleEvent(decryptedEvent2);
        tracker.addVisibleEvent(decryptedEvent3);

        const now = Date.now();
        tracker.eventDecrypted(decryptedEvent1, now);
        tracker.eventDecrypted(decryptedEvent2, now);
        tracker.eventDecrypted(decryptedEvent3, now);

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        tracker.trackFailures();

        expect(counts["OlmUnspecifiedError"]).toBe(3);
    });

    it("should remap error codes correctly", async () => {
        const counts: Record<string, number> = {};

        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            (errorCode: string) => (counts[errorCode] = (counts[errorCode] || 0) + 1),
            (errorCode: string) => Array.from(errorCode).reverse().join(""),
        );

        const decryptedEvent = await createFailedDecryptionEvent({
            code: DecryptionFailureCode.OLM_UNKNOWN_MESSAGE_INDEX,
        });
        tracker.addVisibleEvent(decryptedEvent);
        tracker.eventDecrypted(decryptedEvent, Date.now());

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        tracker.trackFailures();

        // should track remapped error code
        expect(counts["XEDNI_EGASSEM_NWONKNU_MLO"]).toBe(1);
    });

    it("tracks late decryptions vs. undecryptable", async () => {
        const propertiesByErrorCode: Record<string, ErrorProperties> = {};
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            (errorCode: string, rawError: string, properties: ErrorProperties) => {
                propertiesByErrorCode[errorCode] = properties;
            },
            (error: string) => error,
        );

        // use three different errors so that we can distinguish the reports
        const error1 = DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID;
        const error2 = DecryptionFailureCode.MEGOLM_BAD_ROOM;
        const error3 = DecryptionFailureCode.MEGOLM_MISSING_FIELDS;

        // event that will be slow to decrypt
        const lateDecryption = await createFailedDecryptionEvent({ code: error1 });
        // event that will be so slow to decrypt, it gets counted as undecryptable
        const veryLateDecryption = await createFailedDecryptionEvent({ code: error2 });
        // event that never gets decrypted
        const neverDecrypted = await createFailedDecryptionEvent({ code: error3 });

        tracker.addVisibleEvent(lateDecryption);
        tracker.addVisibleEvent(veryLateDecryption);
        tracker.addVisibleEvent(neverDecrypted);

        const now = Date.now();
        tracker.eventDecrypted(lateDecryption, now);
        tracker.eventDecrypted(veryLateDecryption, now);
        tracker.eventDecrypted(neverDecrypted, now);

        await decryptExistingEvent(lateDecryption, {
            plainType: "m.room.message",
            plainContent: { body: "success" },
        });
        await decryptExistingEvent(veryLateDecryption, {
            plainType: "m.room.message",
            plainContent: { body: "success" },
        });
        tracker.eventDecrypted(lateDecryption, now + 40000);
        tracker.eventDecrypted(veryLateDecryption, now + 100000);

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        tracker.trackFailures();

        expect(propertiesByErrorCode[error1].timeToDecryptMillis).toEqual(40000);
        expect(propertiesByErrorCode[error2].timeToDecryptMillis).toEqual(-1);
        expect(propertiesByErrorCode[error3].timeToDecryptMillis).toEqual(-1);
    });

    it("tracks client information", async () => {
        const client = mocked(stubClient());
        const mockCrypto = {
            getVersion: jest.fn().mockReturnValue("Rust SDK 0.7.0 (61b175b), Vodozemac 0.5.1"),
            getUserVerificationStatus: jest.fn().mockResolvedValue(new UserVerificationStatus(false, false, false)),
        } as unknown as Mocked<CryptoApi>;
        client.getCrypto.mockReturnValue(mockCrypto);

        const propertiesByErrorCode: Record<string, ErrorProperties> = {};
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            (errorCode: string, rawError: string, properties: ErrorProperties) => {
                propertiesByErrorCode[errorCode] = properties;
            },
            (error: string) => error,
        );

        // @ts-ignore access to private method
        tracker.setClient(client);

        // use three different errors so that we can distinguish the reports
        const error1 = DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID;
        const error2 = DecryptionFailureCode.MEGOLM_BAD_ROOM;
        const error3 = DecryptionFailureCode.MEGOLM_MISSING_FIELDS;

        // event from a federated user (@alice:example.com)
        const federatedDecryption = await createFailedDecryptionEvent({
            code: error1,
        });
        // event from a local user
        const localDecryption = await createFailedDecryptionEvent({
            sender: "@bob:matrix.org",
            code: error2,
        });

        tracker.addVisibleEvent(federatedDecryption);
        tracker.addVisibleEvent(localDecryption);

        const now = Date.now();
        tracker.eventDecrypted(federatedDecryption, now);

        mockCrypto.getUserVerificationStatus.mockResolvedValue(new UserVerificationStatus(true, true, false));
        client.emit(CryptoEvent.KeysChanged, {});
        await sleep(100);
        tracker.eventDecrypted(localDecryption, now);

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);

        tracker.trackFailures();

        expect(propertiesByErrorCode[error1].isMatrixDotOrg).toBe(true);
        expect(propertiesByErrorCode[error1].cryptoSDK).toEqual("Rust");

        expect(propertiesByErrorCode[error1].isFederated).toBe(true);
        expect(propertiesByErrorCode[error1].userTrustsOwnIdentity).toEqual(false);
        expect(propertiesByErrorCode[error2].isFederated).toBe(false);
        expect(propertiesByErrorCode[error2].userTrustsOwnIdentity).toEqual(true);

        // change client params, and make sure the reports the right values
        client.getDomain.mockReturnValue("example.com");
        mockCrypto.getVersion.mockReturnValue("Olm 0.0.0");
        // @ts-ignore access to private method
        tracker.setClient(client);

        const anotherFailure = await createFailedDecryptionEvent({
            code: error3,
        });
        tracker.addVisibleEvent(anotherFailure);
        tracker.eventDecrypted(anotherFailure, now);
        tracker.checkFailures(Infinity);
        tracker.trackFailures();
        expect(propertiesByErrorCode[error3].isMatrixDotOrg).toBe(false);
        expect(propertiesByErrorCode[error3].cryptoSDK).toEqual("Legacy");
    });

    it("keeps the original timestamp after repeated decryption failures", async () => {
        const failedDecryptionEvent = await createFailedDecryptionEvent();

        let failure: ErrorProperties | undefined;
        // @ts-ignore access to private constructor
        const tracker = new DecryptionFailureTracker(
            (errorCode: string, rawError: string, properties: ErrorProperties) => {
                failure = properties;
            },
            () => "UnknownError",
        );

        tracker.addVisibleEvent(failedDecryptionEvent);

        const now = Date.now();
        tracker.eventDecrypted(failedDecryptionEvent, now);
        tracker.eventDecrypted(failedDecryptionEvent, now + 20000);
        await decryptExistingEvent(failedDecryptionEvent, {
            plainType: "m.room.message",
            plainContent: { body: "success" },
        });
        tracker.eventDecrypted(failedDecryptionEvent, now + 50000);

        // Pretend "now" is Infinity
        tracker.checkFailures(Infinity);
        tracker.trackFailures();

        // the time to decrypt should be relative to the first time we failed
        // to decrypt, not the second
        expect(failure?.timeToDecryptMillis).toEqual(50000);
    });
});
