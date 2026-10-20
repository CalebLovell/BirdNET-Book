import assert from "node:assert/strict";
import test from "node:test";

import { isPrivateAddress } from "./auth-policy.server.ts";

test("recognises loopback and RFC1918 addresses as private", () => {
	for (const ip of [
		"127.0.0.1",
		"10.0.0.5",
		"172.16.4.1",
		"172.31.255.254",
		"192.168.1.20",
		"::1",
		"fd00::1",
		"::ffff:192.168.1.20",
	]) {
		assert.equal(isPrivateAddress(ip), true, ip);
	}
});

test("treats public and unknown addresses as not private", () => {
	for (const ip of [
		"8.8.8.8",
		"172.32.0.1",
		"203.0.113.7",
		"2606:4700::1111",
		undefined,
		"",
		"nonsense",
	]) {
		assert.equal(isPrivateAddress(ip), false, String(ip));
	}
});

test("rejects addresses with an out-of-range octet, even in a private-looking prefix", () => {
	for (const ip of [
		"192.168.1.256",
		"10.0.0.999",
		"172.16.0.256",
		"8.8.256.8",
		"203.0.113.999",
	]) {
		assert.equal(isPrivateAddress(ip), false, ip);
	}
});

test("accepts .0 and .255 boundary octets where the prefix is private", () => {
	assert.equal(isPrivateAddress("10.0.0.0"), true);
	assert.equal(isPrivateAddress("10.255.255.255"), true);
	assert.equal(isPrivateAddress("192.168.0.0"), true);
	assert.equal(isPrivateAddress("192.168.255.255"), true);
});
