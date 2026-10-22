import { describe, expect, it } from "vitest";
import { canonicalNumber, findUngroundedValues, GroundingCorpus } from "@/lib/ai/verification/grounding";
import { fixtureAddress, fixtureDigest } from "../helpers/fake-chain";

const WALLET = fixtureAddress("wallet-b");
const TX1 = fixtureDigest("recent-1");
const TX2 = fixtureDigest("recent-2");
const WAL = "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL";
const NOW = new Date("2026-10-22T04:00:00.000Z");

// Shapes taken from real tool outputs (wallet inspector + network status).
const toolOutputs = [
  {
    address: WALLET,
    balances: {
      items: [
        { coinType: "0x2::sui::SUI", balanceAtomic: "102368496", decimals: 9, display: "0.102368496" },
        { coinType: WAL, balanceAtomic: "80000000", decimals: 9, display: "0.08" },
      ],
    },
    recentTransactions: {
      items: [
        { digest: TX1, checkpoint: "336599699", timestamp: "2026-10-21T20:21:43.457Z" },
        { digest: TX2, checkpoint: "335895587", timestamp: "2026-10-19T22:02:22.623Z" },
      ],
    },
  },
  { network: { currentCheckpointHeight: "336711854", headTimestamp: "2026-10-22T03:51:20.100Z", epoch: "1288" }, checkpoint: { transactionCount: 28 } },
];
const corpus = () => new GroundingCorpus([`what do you know about ${WALLET}`, ...toolOutputs.map((o) => JSON.stringify(o))], NOW);

describe("answer grounding", () => {
  it("accepts values copied from tool output, roundings and exact SUI conversions", () => {
    const answer = [
      `**${WALLET}** holds **SUI:** \`102368496\` atomic units (\`0.102368496\` SUI) and 0.08 WAL [E4].`,
      `That is roughly 0.1024 SUI. Recent: \`${TX1}\` at 2026-10-21T20:21 UTC and ${TX2} on October 19, 2026 (19 Oct 2026).`,
      "The network head was checkpoint 336711854 in epoch 1288, as of 2026-10-22.",
      "A transfer of 102,368,496 MIST is the same as 0.102368496 SUI.",
    ].join("\n");
    expect(findUngroundedValues(answer, corpus())).toEqual([]);
  });

  it("flags a misremembered date (seen live: Oct 29 instead of Oct 19)", () => {
    const ungrounded = findUngroundedValues(`${TX2} executed on Oct 29, 2026 and again 2026-10-29T22:02Z.`, corpus());
    expect(ungrounded).toEqual([
      { kind: "date", value: "2026-10-29T22:02" },
      { kind: "date", value: "Oct 29, 2026" },
    ]);
  });

  it("flags a right date with a wrong time, and month-day dates without a year", () => {
    expect(findUngroundedValues("at 2026-10-19T23:02", corpus())).toEqual([{ kind: "date", value: "2026-10-19T23:02" }]);
    expect(findUngroundedValues("on Oct 19", corpus())).toEqual([]);
    expect(findUngroundedValues("on Oct 18", corpus())).toEqual([{ kind: "date", value: "Oct 18" }]);
  });

  it("flags invented digests, addresses and amounts", () => {
    const fake = fixtureDigest("never-fetched");
    const stranger = fixtureAddress("stranger");
    const ungrounded = findUngroundedValues(`Sent 1.5 SUI and 2,000 WAL to ${stranger} in ${fake}; 7 atomic units of gas.`, corpus());
    expect(ungrounded).toEqual([
      { kind: "digest", value: fake },
      { kind: "address", value: stranger },
      { kind: "amount", value: "1.5 SUI" },
      { kind: "amount", value: "2,000 WAL" },
      { kind: "amount", value: "7 atomic units" },
    ]);
  });

  it("does not read hex or digest fragments as fetched numbers", () => {
    // "356" occurs inside the WAL package id; it must not ground "356 WAL".
    expect(findUngroundedValues("It moved 356 WAL.", corpus())).toEqual([{ kind: "amount", value: "356 WAL" }]);
  });

  it("ignores truncated ids, plain counts and lowercase month words", () => {
    expect(findUngroundedValues("Wallet 0x51f2d246… sent 5 transactions; it may 3x its balance.", corpus())).toEqual([]);
  });

  it("canonicalises numbers", () => {
    expect(canonicalNumber("1,500.500")).toBe("1500.5");
    expect(canonicalNumber("-0.080")).toBe("0.08");
    expect(canonicalNumber("007")).toBe("7");
    expect(canonicalNumber("1e9")).toBeNull();
  });
});
