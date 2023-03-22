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

import { LruCache } from "../../src/utils/LruCache";

describe("LruCache", () => {
    it("when creating a cache with negative capacity it should raise an error", () => {
        expect(() => {
            new LruCache(-23);
        }).toThrow("Cache capacity must be at least 1");
    });

    it("when creating a cache with 0 capacity it should raise an error", () => {
        expect(() => {
            new LruCache(0);
        }).toThrow("Cache capacity must be at least 1");
    });

    describe("when there is a cache with a capacity of 3", () => {
        let cache: LruCache<string, string>;

        beforeEach(() => {
            cache = new LruCache(3);
        });

        it("has() should return false", () => {
            expect(cache.has("a")).toBe(false);
        });

        it("get() should return undefined", () => {
            expect(cache.get("a")).toBeUndefined();
        });

        it("values() should return an empty iterator", () => {
            expect(Array.from(cache.values())).toEqual([]);
        });

        describe("when the cache contains 2 items", () => {
            beforeEach(() => {
                cache.set("a", "a value");
                cache.set("b", "b value");
            });

            it("has() should return false for an item not in the cache", () => {
                expect(cache.has("c")).toBe(false);
            });

            it("get() should return undefined for an item not in the cahce", () => {
                expect(cache.get("c")).toBeUndefined();
            });

            it("values() should return the items in the cache", () => {
                expect(Array.from(cache.values())).toEqual(["a value", "b value"]);
            });
        });

        describe("when the cache contains 3 items", () => {
            beforeEach(() => {
                cache.set("a", "a value");
                cache.set("b", "b value");
                cache.set("c", "c value");
            });

            describe("and accesing the first added item and adding another item", () => {
                beforeEach(() => {
                    cache.get("a");
                    cache.set("d", "d value");
                });

                it("should contain the last recently accessed items", () => {
                    expect(cache.has("a")).toBe(true);
                    expect(cache.get("a")).toEqual("a value");
                    expect(cache.has("c")).toBe(true);
                    expect(cache.get("c")).toEqual("c value");
                    expect(cache.has("d")).toBe(true);
                    expect(cache.get("d")).toEqual("d value");
                    expect(Array.from(cache.values())).toEqual(["a value", "c value", "d value"]);
                });

                it("should not contain the least recently accessed items", () => {
                    expect(cache.has("b")).toBe(false);
                    expect(cache.get("b")).toBeUndefined();
                });
            });

            describe("and adding 2 additional items", () => {
                beforeEach(() => {
                    cache.set("d", "d value");
                    cache.set("e", "e value");
                });

                it("has() should return false for expired items", () => {
                    expect(cache.has("a")).toBe(false);
                    expect(cache.has("b")).toBe(false);
                });

                it("has() should return true for items in the caceh", () => {
                    expect(cache.has("c")).toBe(true);
                    expect(cache.has("d")).toBe(true);
                    expect(cache.has("e")).toBe(true);
                });

                it("get() should return undefined for expired items", () => {
                    expect(cache.get("a")).toBeUndefined();
                    expect(cache.get("b")).toBeUndefined();
                });

                it("get() should return the items in the cache", () => {
                    expect(cache.get("c")).toBe("c value");
                    expect(cache.get("d")).toBe("d value");
                    expect(cache.get("e")).toBe("e value");
                });

                it("values() should return the items in the cache", () => {
                    expect(Array.from(cache.values())).toEqual(["c value", "d value", "e value"]);
                });
            });
        });

        describe("when the cache contains some items where one of them is a replacement", () => {
            beforeEach(() => {
                cache.set("a", "a value");
                cache.set("b", "b value");
                cache.set("c", "c value");
                cache.set("a", "a value 2");
                cache.set("d", "d value");
            });

            it("should contain the last recently set items", () => {
                expect(cache.has("a")).toBe(true);
                expect(cache.get("a")).toEqual("a value 2");
                expect(cache.has("c")).toBe(true);
                expect(cache.get("c")).toEqual("c value");
                expect(cache.has("d")).toBe(true);
                expect(cache.get("d")).toEqual("d value");
                expect(Array.from(cache.values())).toEqual(["a value 2", "c value", "d value"]);
            });
        });
    });
});
