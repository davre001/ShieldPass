import { motion } from "motion/react";

export default function AboutPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 relative z-10">
      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-4xl md:text-5xl font-bold text-white mb-6 font-display"
      >
        About ShieldPass
      </motion.h1>
      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="text-lg md:text-xl text-white/70 max-w-2xl font-light leading-relaxed"
      >
        ShieldPass is a zero-knowledge P2P trading platform built on Stellar. 
        We believe that you should be able to trade crypto for fiat securely 
        without ever exposing your personal identity or banking data on-chain. 
        By utilizing advanced ZK-proofs, we verify your identity locally and 
        only settle the cryptographic proofs on the network.
      </motion.p>
    </div>
  );
}
