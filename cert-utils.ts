import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CERTS_DIR = ".certs";
const CERT_PATH = join(CERTS_DIR, "cert.pem");
const KEY_PATH = join(CERTS_DIR, "key.pem");

export interface CertificatePaths {
  cert: string;
  key: string;
}

export function getOrCreateCertificate(): CertificatePaths {
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
    return { cert: CERT_PATH, key: KEY_PATH };
  }

  if (!existsSync(CERTS_DIR)) {
    mkdirSync(CERTS_DIR, { recursive: true });
  }

  try {
    const opensslCommand = `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_PATH}" -out "${CERT_PATH}" -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"`;
    execSync(opensslCommand, { stdio: "pipe" });
    console.log(`Generated self-signed certificate at ${CERT_PATH}`);
    console.log("You may need to accept this certificate in your browser on first use.");
  } catch (error) {
    console.error("Failed to generate certificate using openssl:", error);
    throw new Error(
      "Certificate generation failed. Please ensure openssl is installed: brew install openssl"
    );
  }

  return { cert: CERT_PATH, key: KEY_PATH };
}

