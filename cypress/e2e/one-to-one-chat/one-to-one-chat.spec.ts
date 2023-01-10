/*
Copyright 2023 Ahmad Kadri
Copyright 2023 Nordeck IT + Consulting GmbH.

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

/// <reference types="cypress" />

import { SynapseInstance } from "../../plugins/synapsedocker";
import type { Credentials } from "../../support/synapse";

describe("1:1 chat room", () => {
    let synapse: SynapseInstance;
    let user2: Credentials;

    const username = "user1234";
    const password = "p4s5W0rD";

    beforeEach(() => {
        cy.startSynapse("default").then((data) => {
            synapse = data;

            cy.initTestUser(synapse, "Jeff");
            cy.registerUser(synapse, username, password).then((credentials) => {
                user2 = credentials;
                cy.visit(`/#/user/${user2.userId}?action=chat`);
            });
        });
    });

    afterEach(() => {
        cy.stopSynapse(synapse);
    });

    it("should open new 1:1 chat room after leaving the old one", () => {
        // leave 1:1 chat room
        cy.contains(".mx_RoomHeader_nametext", username).click();
        cy.contains('[role="menuitem"]', "Leave").click();
        cy.get('[data-testid="dialog-primary-button"]').click();

        // wait till the room was left
        cy.get('[role="group"][aria-label="Historical"]').within(() => {
            cy.contains(".mx_RoomTile", username);
        });

        // open new 1:1 chat room
        cy.visit(`/#/user/${user2.userId}?action=chat`);
        cy.contains(".mx_RoomHeader_nametext", username);
    });
});
