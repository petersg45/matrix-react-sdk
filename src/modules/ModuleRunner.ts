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

import { safeSet } from "matrix-js-sdk/src/utils";
import { TranslationStringsObject } from "@matrix-org/react-sdk-module-api/lib/types/translations";
import { AnyLifecycle } from "@matrix-org/react-sdk-module-api/lib/lifecycles/types";
import {
    DefaultCryptoSetupExtensions,
    ProvideCryptoSetupExtensions,
} from "@matrix-org/react-sdk-module-api/lib/lifecycles/CryptoSetupExtensions";
import {
    DefaultExperimentalExtensions,
    ProvideExperimentalExtensions,
} from "@matrix-org/react-sdk-module-api/lib/lifecycles/ExperimentalExtensions";

import { AppModule } from "./AppModule";
import { ModuleFactory } from "./ModuleFactory";

import "./ModuleComponents";

/**
 * Handles and manages extensions provided by modules.
 */
export class ExtensionsManager {
    // Private backing fields for extensions
    private _cryptoSetup: ProvideCryptoSetupExtensions;
    private _experimental: ProvideExperimentalExtensions;

    // Map to keep track of which extensions has been provided by modules.
    private implementionMap = {
        hasDefaultCryptoSetupExtension: true,
        hasDefaultExperimentalExtension: true,
    };

    /**
     * Create a new instance.
     */
    public constructor() {
        // Set up defaults
        this._cryptoSetup = new DefaultCryptoSetupExtensions();
        this._experimental = new DefaultExperimentalExtensions();
    }

    /**
     * Provides a crypto setup extension.
     *
     * @returns The registered extension. If no module provides this extension, a default implementation is returned.
     */
    public get cryptoSetup(): ProvideCryptoSetupExtensions {
        return this._cryptoSetup;
    }

    /**
     * Provides an experimental extension.
     *
     * @remarks
     * This method extension is provided to simplify experimentation and development, and is not intended for production code.
     *
     * @returns The registered extension. If no module provides this extension, a default implementation is returned.
     */
    public get experimental(): ProvideExperimentalExtensions {
        return this._experimental;
    }

    /**
     * Add any extensions provided by the module.
     *
     * @param module - The appModule to check for extensions.
     *
     * @throws if an extension is provided by more than one module.
     */
    public addExtensions(module: AppModule): void {
        const runtimeModule = module.module;

        /* Record the cryptoSetup extensions if any */
        if (runtimeModule.extensions?.cryptoSetup) {
            if (this.implementionMap.hasDefaultCryptoSetupExtension) {
                this._cryptoSetup = runtimeModule.extensions?.cryptoSetup;
                this.implementionMap.hasDefaultCryptoSetupExtension = false;
            } else {
                throw new Error(
                    `adding cryptoSetup extension implementation from module ${runtimeModule.moduleName} but an implementation was already provided.`,
                );
            }
        }

        /* Record the experimental extensions if any */
        if (runtimeModule.extensions?.experimental) {
            if (this.implementionMap.hasDefaultExperimentalExtension) {
                this._experimental = runtimeModule.extensions?.experimental;
                this.implementionMap.hasDefaultExperimentalExtension = false;
            } else {
                throw new Error(
                    `adding experimental extension implementation from module ${runtimeModule.moduleName} but an implementation was already provided.`,
                );
            }
        }
    }
}

/**
 * Handles and coordinates the operation of modules.
 */
export class ModuleRunner {
    public static readonly instance = new ModuleRunner();

    private _extensions = new ExtensionsManager();

    private modules: AppModule[] = [];

    private constructor() {
        // we only want one instance
    }

    /**
     * Exposes all extensions which may be overridden/provided by modules.
     *
     * @returns An `ExtensionsManager` which exposes the extensions.
     */
    public get extensions(): ExtensionsManager {
        return this._extensions;
    }

    /**
     * Resets the runner, clearing all known modules, and all extensions
     *
     * Intended for test usage only.
     */
    public reset(): void {
        this.modules = [];
        this._extensions = new ExtensionsManager();
    }

    /**
     * All custom translations from all registered modules.
     */
    public get allTranslations(): TranslationStringsObject {
        const merged: TranslationStringsObject = {};

        for (const module of this.modules) {
            const i18n = module.api.translations;
            if (!i18n) continue;

            for (const [lang, strings] of Object.entries(i18n)) {
                safeSet(merged, lang, merged[lang] || {});

                for (const [str, val] of Object.entries(strings)) {
                    safeSet(merged[lang], str, val);
                }
            }
        }

        return merged;
    }

    /**
     * Registers a factory which creates a module for later loading. The factory
     * will be called immediately.
     * @param factory The module factory.
     */
    public registerModule(factory: ModuleFactory): void {
        const appModule = new AppModule(factory);

        this.modules.push(appModule);

        // Check if the new module provides any extensions, and also ensure a given extension is only provided by a single runtime module.
        this._extensions.addExtensions(appModule);
    }

    /**
     * Invokes a lifecycle event, notifying registered modules.
     * @param lifecycleEvent The lifecycle event.
     * @param args The arguments for the lifecycle event.
     */
    public invoke(lifecycleEvent: AnyLifecycle, ...args: any[]): void {
        for (const module of this.modules) {
            module.module.emit(lifecycleEvent, ...args);
        }
    }
}
