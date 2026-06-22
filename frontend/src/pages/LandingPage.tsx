import ScrollHero from "../components/ui/ethereal";
import WalletConnectButton from "../components/WalletConnectButton";
import { Icons } from "../components/ui/icons";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Link } from "react-router-dom";

const btnPrimary =
  "font-mono text-[10px] sm:text-xs uppercase tracking-widest px-5 py-2.5 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors";
const btnGhost =
  "inline-flex items-center gap-2 font-mono text-[10px] sm:text-xs uppercase tracking-widest px-5 py-2.5 rounded-lg font-medium border border-white/15 text-white/80 hover:bg-white/5 transition-colors";

function RevealText({ text }: { text: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, margin: "-100px" });

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
      animate={isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 30, filter: "blur(8px)" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className="inline-block"
    >
      {text}
    </motion.span>
  );
}

function SlowFadeText({ text }: { text: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, margin: "-100px" });

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 2, ease: "easeInOut", delay: 0.2 }}
      className="inline-block"
    >
      {text}&nbsp;
    </motion.span>
  );
}

function TypewriterText({ text, delayStart = 0.4 }: { text: string; delayStart?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, margin: "-100px" });

  return (
    <span ref={ref}>
      {text.split("").map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.05, delay: delayStart + index * 0.02 }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

/* ── Presentational helpers for the right-column media panels ── */

function Panel({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="w-full p-6 sm:p-8 flex flex-col gap-3 justify-center">
      {label && (
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-1">{label}</div>
      )}
      {children}
    </div>
  );
}

function Feature({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#06ffa5]/10 text-[#06ffa5] text-xs">✓</span>
      <span className="text-white/70 text-sm font-light">{label}</span>
    </div>
  );
}

function Asset({ sym, name }: { sym: string; name: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="font-mono text-white text-sm">{sym}</span>
      <span className="text-white/40 text-xs font-light">{name}</span>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <p className="text-white/90 text-sm font-medium mb-1.5">{q}</p>
      <p className="text-white/50 text-xs font-light leading-relaxed">{a}</p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.15em] text-white/55">
      {children}
    </span>
  );
}

export default function LandingPage() {
  return (
    <ScrollHero
      sections={[
        {
          id: "hero",
          headline: "ShieldPass",
          subheadline: <RevealText text="Zero-Knowledge P2P" />,
          body: <TypewriterText text="Trade crypto for naira with zero identity exposure — powered by ZK proofs on Stellar." />,
          action: (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/onboarding" className={btnPrimary}>Get Started</Link>
                <WalletConnectButton />
              </div>
              <div className="flex flex-wrap gap-2">
                <Pill>Stellar Testnet</Pill>
                <Pill>Gasless</Pill>
                <Pill>No Seed Phrase</Pill>
              </div>
            </div>
          ),
          media: (
            <Panel label="Zero-knowledge proof">
              <Feature label="Human · verified" />
              <Feature label="BVN · verified" />
              <Feature label="Good standing · verified" />
              <div className="mt-3 rounded-lg bg-black/40 border border-white/10 px-4 py-3 font-mono text-[11px] text-[#06ffa5] break-all">
                nullifier 0x9f2c…a41e
              </div>
              <p className="text-white/30 text-[10px] font-mono">your identity never leaves this device</p>
            </Panel>
          ),
        },
        {
          id: "privacy",
          headline: "Private",
          subheadline: <RevealText text="By Default" />,
          body: (
            <span>
              <SlowFadeText text="Your BVN and" />
              <TypewriterText
                text="personal data never leave your device. Only cryptographic proofs travel on-chain."
                delayStart={1.5}
              />
            </span>
          ),
          media: (
            <Panel label="Where your data lives">
              <div className="rounded-xl border border-[#06ffa5]/20 bg-[#06ffa5]/[0.04] px-4 py-3">
                <p className="text-[#06ffa5] text-[11px] font-mono mb-1">ON YOUR DEVICE</p>
                <p className="text-white/60 text-xs font-light">BVN · name · bank details · secret salt</p>
              </div>
              <div className="text-center text-white/30 text-xs">↓ only a proof crosses ↓</div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-white/70 text-[11px] font-mono mb-1">ON-CHAIN</p>
                <p className="text-white/40 text-xs font-light">zk proof · time-bound nullifier</p>
              </div>
            </Panel>
          ),
        },
        {
          id: "passkeys",
          headline: "Passkeys",
          subheadline: "No Seed Phrase, No Gas",
          body: "Your wallet is a passkey — unlock it with Face ID, a fingerprint, or your device PIN. Every transaction is sponsored, so you never need XLM to begin.",
          media: (
            <Panel label="Sign in with">
              <Feature label="Face ID" />
              <Feature label="Fingerprint" />
              <Feature label="Device PIN (Windows Hello)" />
              <Feature label="Your phone — scan the QR" />
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-white/70 text-xs font-light">
                  <span className="text-[#06ffa5] font-mono">0 XLM</span> needed — fees sponsored via OpenZeppelin Channels
                </p>
              </div>
            </Panel>
          ),
        },
        {
          id: "escrow",
          headline: "Trustless",
          subheadline: "Non-Custodial Escrow",
          body: "Smart contracts lock funds until both parties confirm — no middleman ever holds your crypto, and your keys never leave your device.",
          media: (
            <Panel label="How escrow protects you">
              <Feature label="Crypto locked in a smart contract" />
              <Feature label="Released only on confirmed payment" />
              <Feature label="No middleman can freeze funds" />
              <Feature label="Your keys never leave your device" />
            </Panel>
          ),
        },
        {
          id: "assets",
          headline: "Assets",
          subheadline: <RevealText text="Crypto ⇄ Naira" />,
          body: "Trade between Stellar-native assets and Nigerian naira. Fiat moves through Paystack while crypto settles on-chain.",
          media: (
            <Panel label="Supported assets">
              <Asset sym="XLM" name="Stellar Lumens" />
              <Asset sym="USDC" name="USD Coin" />
              <Asset sym="NGNC" name="Naira stablecoin" />
              <div className="mt-1 flex items-center justify-between rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3">
                <span className="font-mono text-white text-sm">₦ NGN</span>
                <span className="text-white/40 text-xs font-light">via Paystack</span>
              </div>
            </Panel>
          ),
        },
        {
          id: "trade",
          headline: "Trade",
          subheadline: "Freely",
          body: "Peer-to-peer crypto/naira exchange with the safety of KYC but none of the exposure.",
        },
        {
          id: "how-it-works-intro",
          headline: "How It Works",
          subheadline: <RevealText text="The Protocol" />,
          body: <TypewriterText text="A seamless 3-step process to trade securely without exposing your identity." />,
        },
        {
          id: "how-it-works-1",
          headline: "Step 1",
          subheadline: "Create & Verify",
          body: "Create a passkey wallet with Face ID, fingerprint, or your device PIN, and generate a Zero-Knowledge proof of your identity. Your actual data never leaves your device.",
          media: (
            <Panel label="Step 1 · Verify">
              <Feature label="Create passkey wallet" />
              <Feature label="Generate ZK identity proof" />
              <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-2/3 bg-[#06ffa5]/70 rounded-full" />
              </div>
              <p className="text-white/30 text-[10px] font-mono">proving… data stays local</p>
            </Panel>
          ),
        },
        {
          id: "how-it-works-2",
          headline: "Step 2",
          subheadline: "Trustless Escrow",
          body: "Initiate a trade. Your assets are locked securely in a smart contract. No middleman can access or freeze your funds.",
          media: (
            <Panel label="Step 2 · Lock">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-5 text-center">
                <div className="text-3xl mb-1">🔒</div>
                <p className="text-white/70 text-xs font-light">Crypto locked in escrow</p>
              </div>
              <Feature label="Funds safe until settlement" />
            </Panel>
          ),
        },
        {
          id: "how-it-works-3",
          headline: "Step 3",
          subheadline: "P2P Settlement",
          body: "Once fiat payment is confirmed, the smart contract instantly releases the crypto to the buyer's wallet. Fast, secure, and private.",
          media: (
            <Panel label="Step 3 · Settle">
              <Feature label="Naira payment confirmed" />
              <Feature label="Crypto released to buyer" />
              <div className="mt-2 rounded-lg border border-[#06ffa5]/20 bg-[#06ffa5]/[0.05] px-4 py-3 text-center">
                <span className="text-[#06ffa5] text-sm font-mono">✓ SETTLED</span>
              </div>
            </Panel>
          ),
        },
        {
          id: "faq",
          headline: "FAQ",
          subheadline: <RevealText text="Good to Know" />,
          body: "The questions every P2P trader asks — answered up front.",
          media: (
            <div className="w-full p-5 sm:p-6 flex flex-col gap-3 justify-center">
              <Faq q="What if the buyer doesn't pay?" a="Your crypto stays locked in escrow and unpaid trades auto-cancel — nothing is released without confirmed payment." />
              <Faq q="Is ShieldPass custodial?" a="No. Funds sit in a smart contract and your passkey never leaves your device — we can't touch either." />
              <Faq q="I lost my device — can I recover?" a="A passkey is device-bound. Add a backup signer to your wallet so a lost device doesn't mean lost funds." />
              <Faq q="What does it cost?" a="Transactions are gasless — fees are sponsored, so you don't need any XLM to trade on testnet." />
            </div>
          ),
        },
        {
          id: "cta",
          headline: "Start Trading",
          subheadline: <RevealText text="Privately" />,
          body: "Create a passkey, prove your identity with zero knowledge, and trade in minutes.",
          action: (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/onboarding" className={btnPrimary}>Get Started</Link>
                <a
                  href="https://github.com/Xyrelix/ShieldPass"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btnGhost}
                >
                  <Icons.gitHub className="h-4 w-4" /> GitHub
                </a>
              </div>
              <p className="text-white/35 text-xs font-light">
                Running on Stellar Testnet · Built for the Stellar Hacks: ZK hackathon.
              </p>
            </div>
          ),
        },
      ]}
      colorPalette={{
        primary: "#6366f1",
        secondary: "#8b5cf6",
        tertiary: "#ec4899",
        accent: "#06ffa5",
        dark: "#0a0a0a",
      }}
      logo="SHIELDPASS"
      menuItems={["Marketplace", "Dashboard", "Onboarding", "About", "Docs"]}
    />
  );
}
