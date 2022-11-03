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

import { mocked } from 'jest-mock';
import { logger } from 'matrix-js-sdk/src/logger';

import { createAudioContext, decodeOgg } from '../../src/audio/compat';
import { Playback, PlaybackState } from "../../src/audio/Playback";

jest.mock('../../src/audio/compat', () => ({
    createAudioContext: jest.fn(),
    decodeOgg: jest.fn(),
}));

describe('Playback', () => {
    const mockAudioBufferSourceNode = {
        addEventListener: jest.fn(),
        connect: jest.fn(),
        start: jest.fn(),
    };
    const mockAudioContext = {
        decodeAudioData: jest.fn(),
        suspend: jest.fn(),
        resume: jest.fn(),
        createBufferSource: jest.fn().mockReturnValue(mockAudioBufferSourceNode),
        currentTime: 1337,
    };

    const mockAudioBuffer = {
        duration: 99,
        getChannelData: jest.fn(),
    };

    const mockChannelData = new Float32Array();

    beforeEach(() => {
        jest.spyOn(logger, 'error').mockRestore();
        mockAudioBuffer.getChannelData.mockClear().mockReturnValue(mockChannelData);
        mockAudioContext.decodeAudioData.mockReset().mockImplementation(
            (_b, callback) => callback(mockAudioBuffer),
        );
        mockAudioContext.resume.mockClear().mockResolvedValue(undefined);
        mockAudioContext.suspend.mockClear().mockResolvedValue(undefined);
        mocked(decodeOgg).mockClear().mockResolvedValue(new ArrayBuffer(1));
        mocked(createAudioContext).mockReturnValue(mockAudioContext as unknown as AudioContext);
    });

    it('initialises correctly', () => {
        const buffer = new ArrayBuffer(8);

        const playback = new Playback(buffer);
        playback.clockInfo.durationSeconds = mockAudioBuffer.duration;

        expect(playback.sizeBytes).toEqual(8);
        expect(playback.clockInfo).toBeTruthy();
        expect(playback.liveData).toBe(playback.clockInfo.liveData);
        expect(playback.timeSeconds).toBe(1337 % 99);
        expect(playback.currentState).toEqual(PlaybackState.Decoding);
    });

    it('toggles playback on from stopped state', async () => {
        const buffer = new ArrayBuffer(8);
        const playback = new Playback(buffer);
        await playback.prepare();
        // state is Stopped
        await playback.toggle();

        expect(mockAudioBufferSourceNode.start).toHaveBeenCalled();
        expect(mockAudioContext.resume).toHaveBeenCalled();
        expect(playback.currentState).toEqual(PlaybackState.Playing);
    });

    it('toggles playback to paused from playing state', async () => {
        const buffer = new ArrayBuffer(8);
        const playback = new Playback(buffer);
        await playback.prepare();
        await playback.toggle();
        expect(playback.currentState).toEqual(PlaybackState.Playing);

        await playback.toggle();

        expect(mockAudioContext.suspend).toHaveBeenCalled();
        expect(playback.currentState).toEqual(PlaybackState.Paused);
    });

    it('stop playbacks', async () => {
        const buffer = new ArrayBuffer(8);
        const playback = new Playback(buffer);
        await playback.prepare();
        await playback.toggle();
        expect(playback.currentState).toEqual(PlaybackState.Playing);

        await playback.stop();

        expect(mockAudioContext.suspend).toHaveBeenCalled();
        expect(playback.currentState).toEqual(PlaybackState.Stopped);
    });

    describe('prepare()', () => {
        it('decodes audio data when not greater than 5mb', async () => {
            const buffer = new ArrayBuffer(8);

            const playback = new Playback(buffer);

            await playback.prepare();

            expect(mockAudioContext.decodeAudioData).toHaveBeenCalledTimes(1);
            expect(mockAudioBuffer.getChannelData).toHaveBeenCalledWith(0);

            // clock was updated
            expect(playback.clockInfo.durationSeconds).toEqual(mockAudioBuffer.duration);
            expect(playback.durationSeconds).toEqual(mockAudioBuffer.duration);

            expect(playback.currentState).toEqual(PlaybackState.Stopped);
        });

        it('tries to decode ogg when decodeAudioData fails', async () => {
            // stub logger to keep console clean from expected error
            jest.spyOn(logger, 'error').mockReturnValue(undefined);
            jest.spyOn(logger, 'warn').mockReturnValue(undefined);

            const buffer = new ArrayBuffer(8);
            const decodingError = new Error('test');
            mockAudioContext.decodeAudioData.mockImplementationOnce(
                (_b, _callback, error) => error(decodingError),
            ).mockImplementationOnce(
                (_b, callback) => callback(mockAudioBuffer),
            );

            const playback = new Playback(buffer);

            await playback.prepare();

            expect(mockAudioContext.decodeAudioData).toHaveBeenCalledTimes(2);
            expect(decodeOgg).toHaveBeenCalled();

            // clock was updated
            expect(playback.clockInfo.durationSeconds).toEqual(mockAudioBuffer.duration);
            expect(playback.durationSeconds).toEqual(mockAudioBuffer.duration);

            expect(playback.currentState).toEqual(PlaybackState.Stopped);
        });

        it('does not try to re-decode audio', async () => {
            const buffer = new ArrayBuffer(8);
            const playback = new Playback(buffer);
            await playback.prepare();
            expect(playback.currentState).toEqual(PlaybackState.Stopped);

            await playback.prepare();

            // only called once in first prepare
            expect(mockAudioContext.decodeAudioData).toHaveBeenCalledTimes(1);
        });
    });
});
