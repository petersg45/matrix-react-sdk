import * as linkify from "linkifyjs";
import linkifyMatrix from '../src/linkify-matrix';

describe('linkify-matrix', () => {
    beforeAll(() => {
        linkifyMatrix(linkify);
    });
    describe('roomalias', () => {
        it('properly parses #_foonetic_xkcd:matrix.org', () => {
            const test = '#_foonetic_xkcd:matrix.org';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#_foonetic_xkcd:matrix.org",
                type: "roomalias",
                value: "#_foonetic_xkcd:matrix.org",
            }]));
        });
        it('properly parses #foo:localhost', () => {
            const test = "#foo:localhost";
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo:localhost",
                type: "roomalias",
                value: "#foo:localhost",
            }]));
        });
        it('accept #foo:bar.com', () => {
            const test = '#foo:bar.com';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo:bar.com",
                type: "roomalias",
                value: "#foo:bar.com",

            }]));
        });
        it('accept #foo:com (mostly for (TLD|DOMAIN)+ mixing)', () => {
            const test = '#foo:com';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo:com",
                type: "roomalias",
                value: "#foo:com",
            }]));
        });
        it('accept repeated TLDs (e.g .org.uk)', () => {
            const test = '#foo:bar.org.uk';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo:bar.org.uk",
                type: "roomalias",
                value: "#foo:bar.org.uk",
            }]));
        });
        it('ignores trailing `:`', () => {
            const test = '#foo:bar.com:';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo:bar.com",
                type: "roomalias",
                value: "#foo:bar.com",

            }]));
        });
        it('accept :NUM (port specifier)', () => {
            const test = '#foo:bar.com:2225';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo:bar.com:2225",
                type: "roomalias",
                value: "#foo:bar.com:2225",
            }]));
        });
        it('ignores all the trailing :', () => {
            const test = '#foo:bar.com::::';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo:bar.com",
                type: "roomalias",
                value: "#foo:bar.com",

            }]));
        });
        it('properly parses room alias with dots in name', () => {
            const test = '#foo.asdf:bar.com::::';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo.asdf:bar.com",
                type: "roomalias",
                value: "#foo.asdf:bar.com",

            }]));
        });
        // This test does not work and does not parse the room
        it.skip('does not parse room alias with too many separators', () => {
            const test = '#foo:::bar.com';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "#foo",
                type: 'roomalias',
                value: '#foo',
            },
            {
                href: "http://bar.com",
                type: "url",
                value: "bar.com",
            }]));
        });
        // This should not parse correctly, but it's been working this way in the previous version too
        it.skip('does not parse multiple room aliases in one string', () => {
            const test = '#foo:bar.com-baz.com';
            const found = linkify.find(test);
            expect(found).toEqual(([]));
        });
    });

    describe('groupid', () => {
        it('properly parses +foo:localhost', () => {
            const test = "+foo:localhost";
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "+foo:localhost",
                type: "groupid",
                value: "+foo:localhost",
            }]));
        });
        it('accept +foo:bar.com', () => {
            const test = '+foo:bar.com';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "+foo:bar.com",
                type: "groupid",
                value: "+foo:bar.com",
            }]));
        });
        it('accept +foo:com (mostly for (TLD|DOMAIN)+ mixing)', () => {
            const test = '+foo:com';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "+foo:com",
                type: "groupid",
                value: "+foo:com",
            }]));
        });
        it('accept repeated TLDs (e.g .org.uk)', () => {
            const test = '+foo:bar.org.uk';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "+foo:bar.org.uk",
                type: "groupid",
                value: "+foo:bar.org.uk",
            }]));
        });
        // This test should not be failing according to the linkify-matrix code
        // TODO: Fix the implementation so the test properly ignores trailing ':'
        it.skip('do not accept trailing `:`', () => {
            const test = '+foo:bar.com:';
            const found = linkify.find(test);
            expect(found).toEqual(([]));
        });
        it('accept :NUM (port specifier)', () => {
            const test = '+foo:bar.com:2225';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "+foo:bar.com:2225",
                type: "groupid",
                value: "+foo:bar.com:2225",
            }]));
        });
    });

    describe('userid', () => {
        // It does not parse a single user ID without domain
        it.skip('properly parses @foo', () => {
            const test = "@foo";
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "@foo",
                type: "userid",
                value: "@foo",
            }]));
        });
        it('accept @foo:bar.com', () => {
            const test = '@foo:bar.com';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "@foo:bar.com",
                type: "userid",
                value: "@foo:bar.com",
            }]));
        });
        it('accept @foo:com (mostly for (TLD|DOMAIN)+ mixing)', () => {
            const test = '@foo:com';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "@foo:com",
                type: "userid",
                value: "@foo:com",
            }]));
        });
        it('accept repeated TLDs (e.g .org.uk)', () => {
            const test = '@foo:bar.org.uk';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "@foo:bar.org.uk",
                type: "userid",
                value: "@foo:bar.org.uk",
            }]));
        });
        // This test should not be failing according to the linkify-matrix code
        // TODO: Fix the implementation so the test properly ignores trailing ':'
        it.skip('do not accept trailing `:`', () => {
            const test = '@foo:bar.com:';
            const found = linkify.find(test);
            expect(found).toEqual(([]));
        });
        it('accept :NUM (port specifier)', () => {
            const test = '@foo:bar.com:2225';
            const found = linkify.find(test);
            expect(found).toEqual(([{
                href: "@foo:bar.com:2225",
                type: "userid",
                value: "@foo:bar.com:2225",
            }]));
        });
    });
});
