import * as faker from 'faker';
import * as http from 'http';
import { createProxyServer, ServerOptions } from 'http-proxy';
import nock from 'nock';
import { IProxyConfig, IXrayVersion } from '../../../model';
import { IJfrogClientConfig } from '../../../model/JfrogClientConfig';
import { JfrogClient } from '../../../src';
import { TestUtils } from '../../TestUtils';

let isPassedThroughProxy: boolean;
let jfrogClient: JfrogClient;

describe('Xray System tests', () => {
    const clientConfig: IJfrogClientConfig = TestUtils.getJfrogClientConfig();
    beforeAll(() => {
        jfrogClient = new JfrogClient(clientConfig);
    });
    afterAll(() => {
        nock.cleanAll();
    });

    test('Version', async () => {
        const version: IXrayVersion = await jfrogClient.xray().system().version();
        expect(version.xray_version).toBeTruthy();
        expect(version.xray_revision).toBeTruthy();
        expect(isPassedThroughProxy).toBeFalsy();
    });

    describe('Ping tests', () => {
        const PING_RES: any = { status: 'pong' };

        beforeEach(() => {
            process.env.HTTPS_PROXY = '';
            process.env.NO_PROXY = '';
            isPassedThroughProxy = false;
        });

        test('Ping success', async () => {
            const response: any = await jfrogClient.xray().system().ping();
            expect(response).toStrictEqual(PING_RES);
            expect(isPassedThroughProxy).toBeFalsy();
        });

        describe('Ping proxy', () => {
            let proxy: any;
            let proxyJfrogClient: JfrogClient;
            beforeAll(() => {
                clientConfig.proxy = { port: 9090 } as IProxyConfig;
                proxyJfrogClient = new JfrogClient(clientConfig);
                proxy = createProxyServer({ target: clientConfig.platformUrl } as ServerOptions).listen(9090);
                proxy.on('proxyReq', () => (isPassedThroughProxy = true));
            });
            afterAll(() => {
                proxy.close();
            });

            test('Ping through proxy', async () => {
                const response: any = await proxyJfrogClient.xray().system().ping();
                expect(response).toStrictEqual(PING_RES);
                expect(isPassedThroughProxy).toBeTruthy();
            });

            test('Ping through proxy env', async () => {
                process.env.HTTPS_PROXY = 'http://127.0.0.1:9090';
                const response: any = await jfrogClient.xray().system().ping();
                expect(response).toStrictEqual(PING_RES);
                expect(isPassedThroughProxy).toBeTruthy();
            });

            test('Ping skip proxy', async () => {
                process.env.HTTPS_PROXY = 'http://127.0.0.1:9090';
                process.env.NO_PROXY = clientConfig.platformUrl;
                const response: any = await jfrogClient.xray().system().ping();
                expect(response).toStrictEqual(PING_RES);
                expect(isPassedThroughProxy).toBeTruthy();
            });

            test('Ping empty proxy', async () => {
                const jfrogClientEmptyProxy: JfrogClient = new JfrogClient({
                    platformUrl: clientConfig.platformUrl,
                    username: clientConfig.username,
                    password: clientConfig.password,
                    accessToken: clientConfig.accessToken,
                    proxy: {} as IProxyConfig,
                    logger: TestUtils.createTestLogger(),
                });
                const response: any = await jfrogClientEmptyProxy.xray().system().ping();
                expect(response).toStrictEqual(PING_RES);
                expect(isPassedThroughProxy).toBeFalsy();
            });

            describe('Ping auth proxy', () => {
                const PROXY_USER: string = faker.internet.userName();
                const PROXY_PASS: string = faker.internet.password();
                let proxyAuthJfrogClient: JfrogClient;
                let authProxy: any;
                beforeAll(() => {
                    clientConfig.proxy = { port: 9091 } as IProxyConfig;
                    clientConfig.headers = {
                        'proxy-authorization': 'Basic ' + Buffer.from(PROXY_USER + ':' + PROXY_PASS).toString('base64'),
                    };
                    proxyAuthJfrogClient = new JfrogClient(clientConfig);
                    authProxy = createProxyServer({ target: clientConfig.platformUrl } as ServerOptions).listen(9091);
                    authProxy.on('proxyReq', (proxyReq: http.ClientRequest) => {
                        isPassedThroughProxy = true;
                        // Check proxy header
                        const actualAuthHeader: string | number | string[] | undefined =
                            proxyReq.getHeader('proxy-authorization');
                        const expectAuthHeader: string =
                            'Basic ' + Buffer.from(PROXY_USER + ':' + PROXY_PASS).toString('base64');
                        expect(actualAuthHeader).toBe(expectAuthHeader);
                    });
                });
                afterAll(() => {
                    authProxy.close();
                });

                test('Ping though auth proxy', async () => {
                    const response: any = await proxyAuthJfrogClient.xray().system().ping();
                    expect(response).toStrictEqual(PING_RES);
                    expect(isPassedThroughProxy).toBeTruthy();
                });
            });
        });

        test('Ping failure', async () => {
            const platformUrl: string = faker.internet.url();
            const scope: nock.Scope = nock(platformUrl)
                .get(`/xray/api/v1/system/ping`)
                .reply(402, { message: 'error' });
            const client: JfrogClient = new JfrogClient({ platformUrl, logger: TestUtils.createTestLogger() });
            const res: any = await client.xray().system().ping();
            expect(res).toBeFalsy();
            expect(scope.isDone()).toBeTruthy();
            expect(isPassedThroughProxy).toBeFalsy();
        });
    });
});
