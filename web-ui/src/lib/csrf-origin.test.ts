import assert from "node:assert/strict";
import test from "node:test";

import { isStationOrigin } from "./csrf-origin.ts";

function request(url: string, headers: Record<string, string> = {}) {
	return new Request(url, { headers });
}

test("accepts the origin the request was addressed to, as on the LAN", () => {
	const lan = request("http://192.168.1.20:3000/_serverFn/abc");
	assert.equal(isStationOrigin("http://192.168.1.20:3000", lan, false), true);
});

test("refuses another site, or the same host on another port or scheme", () => {
	const lan = request("http://192.168.1.20:3000/_serverFn/abc");
	for (const origin of [
		"http://evil.example",
		"http://192.168.1.20:8080",
		"https://192.168.1.20:3000",
		"null",
	]) {
		assert.equal(isStationOrigin(origin, lan, false), false, origin);
	}
});

test("behind a trusted proxy, accepts the HTTPS origin the proxy served", () => {
	const proxied = request("http://birds.example.com/_serverFn/abc", {
		"x-forwarded-proto": "https",
	});
	assert.equal(
		isStationOrigin("https://birds.example.com", proxied, true),
		true,
	);
	const rewritten = request("http://localhost:3000/_serverFn/abc", {
		"x-forwarded-proto": "https",
		"x-forwarded-host": "birds.example.com",
	});
	assert.equal(
		isStationOrigin("https://birds.example.com", rewritten, true),
		true,
	);
	assert.equal(isStationOrigin("https://evil.example", rewritten, true), false);
});

test("ignores forwarded headers unless the proxy is trusted", () => {
	const spoofed = request("http://192.168.1.20:3000/_serverFn/abc", {
		"x-forwarded-proto": "https",
		"x-forwarded-host": "evil.example",
	});
	assert.equal(isStationOrigin("https://evil.example", spoofed, false), false);
});
