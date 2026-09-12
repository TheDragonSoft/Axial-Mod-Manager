# Code Signing & Notarization: Decision Memo & Runbook

This document evaluates code signing and notarization options for Axial, provides the trade-off analysis between commercial signing and unsigned distributions, records our recommendations for the 1.0 release, and documents the dormant CI secrets runbook for future activation.

---

## Executive Summary

When distributing desktop binaries outside of official platform app stores (such as via GitHub Releases), modern operating systems (macOS and Windows) enforce security mechanisms designed to warn users about unsigned or unrecognized software:
- **macOS Gatekeeper** blocks execution of downloaded applications unless they are signed with an Apple Developer ID certificate and notarized by Apple's Notary Service.
- **Windows Defender SmartScreen** displays a warning dialog ("Windows protected your PC") on new, unsigned executables and installers until sufficient global reputation has been accumulated.

Obtaining code-signing certificates involves ongoing financial costs ($99/year for Apple, ~$10/month for Azure Trusted Signing, or $300–$800+/year for traditional hardware/cloud-backed EV certificates) as well as legal identity vetting.

**Recommendation for 1.0:**
1. **Launch 1.0 using the No-Purchase Path ($0)**: Distribute unsigned binaries accompanied by clear, friendly, per-OS first-launch instructions in the README and release notes. Factorio players are technically proficient and accustomed to running modding tools and open-source utilities.
2. **Preserve Cryptographic Integrity via In-App Updater Signatures**: Axial's built-in auto-updater (Phase 3) already verifies updates cryptographically using Minisign public-key signatures (`.sig` files). This guarantees that auto-updates cannot be tampered with, regardless of OS-level code signing.
3. **Dormant CI Wiring**: The release workflow (`.github/workflows/build.yml`) is wired with dormant signing and notarization steps. If and when secrets are configured in GitHub repository settings, signing activates automatically on release builds without any workflow edits.
4. **Post-1.0 Upgrade Priority**: If project funding or sponsorship becomes available, prioritize **macOS Developer ID ($99/year)** first, as macOS Gatekeeper is significantly more aggressive and confusing than Windows SmartScreen.

---

## Platform Deep Dive: macOS

### The Problem
When a user downloads `Axial_x.y.z.dmg` from GitHub and drags `Axial.app` to `/Applications`, macOS marks the application with the `com.apple.quarantine` extended attribute. On launch, Gatekeeper checks whether the app has a valid Developer ID signature and an Apple notarization ticket:
- If **notarized**: The app launches directly with a standard one-time prompt: *"Axial is an app downloaded from the internet. Are you sure you want to open it?"*
- If **unsigned**: Gatekeeper displays a modal dialog: *"Axial cannot be opened because Apple cannot check it for malicious software."* The user is only given options to cancel or move to trash.

### Option A: Apple Developer Program + Notarization ($99/year)
To produce a fully trusted macOS application:
1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99 USD/year recurring).
2. Create a **Developer ID Application** certificate in the Apple Developer portal.
3. Export the certificate and private key as a password-protected `.p12` file.
4. Generate an App-Specific Password (or App Store Connect API Key) for notarization.
5. In CI, sign the `.app` bundle with the Developer ID and submit the bundle to Apple's Notary Service via `xcrun notarytool`, then staple the returned notarization ticket to the disk image (`xcrun stapler staple`).

**Tauri 2 Native Support:**
Tauri CLI has built-in support for macOS code signing and notarization. If the environment variables `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` are present, `tauri build` automatically performs the signing, notarization, and stapling steps.

- **Pros:** Completely seamless user experience; no warning dialogs; builds confidence for Mac users.
- **Cons:** $99/year recurring subscription; requires identity verification with Apple.

### Option B: Unsigned + Documented Gatekeeper Bypass ($0)
macOS provides a built-in mechanism to authorize unsigned software:
1. **Right-Click Bypass:**
   - In Finder, open `/Applications`.
   - **Right-click** (or **Control-click**) `Axial.app` and select **Open**.
   - A dialog will appear stating that Apple cannot verify the developer, but now offers an **Open** button alongside Cancel.
   - Click **Open**.
2. **Terminal Bypass:**
   - Run: `xattr -cr /Applications/Axial.app`
   - This strips the quarantine flag from the application bundle entirely.
3. **Subsequent Launches:**
   - Once opened via either method, macOS permanently records the user's explicit authorization for that version; subsequent launches open normally on standard double-click.

- **Pros:** $0 cost; zero setup overhead; standard practice for open-source utilities.
- **Cons:** First-launch friction; non-technical users may initially hesitate.

---

## Platform Deep Dive: Windows

### The Problem
Microsoft Defender SmartScreen inspects newly downloaded `.exe` and `.msi` installers. If an executable is unsigned or is signed by a certificate that has not yet established reputation across Windows telemetry, SmartScreen displays a blue dialog:
> *"Windows protected your PC. Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

### Option A: Unsigned + Documented SmartScreen Bypass ($0)
SmartScreen provides a simple two-click bypass for users:
1. On the "Windows protected your PC" screen, click the **More info** link.
2. An additional button labeled **Run anyway** appears.
3. Click **Run anyway** to launch the installer.

**Reputation Lifecycle:**
As more Windows users download and run Axial over time, Microsoft Defender telemetry automatically builds reputation for the application. However, because reputation without an EV certificate is tied to specific file hashes, minor version updates may temporarily encounter the SmartScreen dialog until reputation re-establishes.

- **Pros:** $0 cost; zero identity vetting; two-click bypass is familiar to gamers and modders.
- **Cons:** Mild friction and initial warning dialog on new versions.

### Option B: Microsoft Azure Trusted Signing (~$10/month)
Microsoft introduced [Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/) (formerly Azure Code Signing) as a modern, cloud-native signing service:
- **Cost:** ~$9.99/month (Basic tier covers up to 1,000 signing operations per month) under a standard Microsoft Azure subscription.
- **Hardware Token:** None required; signing operations occur securely in the Azure cloud.
- **Identity Vetting:** Requires organization identity validation via Microsoft Partner Center (an eligible business entity or vetted organization profile).
- **Reputation:** Because certificates are issued by Microsoft's vetted CA directly tied to the publisher's Azure identity, files signed with Azure Trusted Signing accumulate SmartScreen reputation substantially faster than traditional OV certificates.
- **CI Integration:** Microsoft publishes `azure/trusted-signing-action` for GitHub Actions, making signing straightforward in automated pipelines.

- **Pros:** Much cheaper than traditional EV certificates; fully cloud-native (no USB dongles); fast SmartScreen trust.
- **Cons:** Requires a registered business/organization entity for Partner Center vetting; ~$120/year ongoing cost.

### Option C: Traditional Commercial OV / EV Certificates ($200–$600+/year)
Traditional code signing certificates purchased from certificate authorities (Sectigo, DigiCert, Certum):
- **Industry Regulation Change:** As of June 1, 2023, the CA/Browser Forum mandates that private keys for **all** code-signing certificates (including standard OV) must be stored on FIPS 140-2 Level 2 certified hardware (physical USB HSM tokens or certified Cloud HSMs).
- **Cloud HSM Costs:** Storing keys in Azure Key Vault or AWS CloudHSM adds ~$1 to $3 per day ($365–$1,000+/year) on top of the certificate purchase price.
- **EV vs OV:** Only EV (Extended Validation) grants immediate, day-one SmartScreen reputation bypass, but EV requires extensive corporate vetting and costs $400–$700+/year. Standard OV certificates still require reputation buildup over time.

- **Pros:** Established industry standard.
- **Cons:** Prohibitively expensive and operationally complex for an independent open-source project.

---

## Platform Deep Dive: Linux

Linux desktop environments and package managers do not enforce commercial code signing.
- **AppImage:** Users download `Axial_<version>_amd64.AppImage`, ensure the executable bit is set (`chmod +x Axial_*.AppImage`), and execute the binary.
- **Debian/Ubuntu:** Users download `Axial_<version>_amd64.deb` and install using `sudo dpkg -i Axial_*.deb` or their graphical software installer.
- **Security:** In-app updates remain verified cryptographically via Minisign (`.sig` signatures) through Tauri's updater plugin.

No paid signing services are needed or standard for Linux desktop distribution.

---

## Comparison Matrix

| Platform | Option | Annual Cost | Identity Verification | SmartScreen / Gatekeeper | CI Setup Complexity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **macOS** | **Unsigned (Current)** | **$0** | **None** | Gatekeeper dialog (Right-click → Open) | Zero |
| macOS | Apple Developer ID | $99 / yr | Apple ID + Government ID | Clean launch; no warning dialog | Moderate (p12 + secrets) |
| **Windows** | **Unsigned (Current)** | **$0** | **None** | SmartScreen dialog (More info → Run anyway) | Zero |
| Windows | Azure Trusted Signing | ~$120 / yr | Azure Organization Vetting | Quick reputation; minimal warnings | Low (`trusted-signing-action`) |
| Windows | Traditional OV/EV Cert | $400–$1,000+ / yr | CA Organization Vetting | EV gives instant trust; OV builds trust | High (Hardware HSM / Cloud Key Vault) |
| **Linux** | **Standard (Current)** | **$0** | **None** | Native (`chmod +x` or `dpkg`) | Zero |

---

## Recommendation & Roadmap

### Phase 4 Decision: The No-Purchase Path
For Axial 1.0, we proceed with the **No-Purchase Path**:
1. **Audience Context:** Axial's audience is Factorio players. The Factorio community is technical, frequently manages local mod files and configuration scripts, and is well-acquainted with open-source tools.
2. **Cost-to-Value Ratio:** For an independent, free mod manager, an ongoing annual commitment of $100–$250+ before establishing active user volume is unjustified.
3. **Security Integrity:** App updates delivered via the auto-updater are already signed cryptographically with our Minisign private key and verified by Tauri's updater before extraction.
4. **Documentation:** Transparent first-launch guides in `README.md` and `RELEASE_NOTES_TEMPLATE.md` provide clear, reassurance-focused instructions on how to open the app for the first time.

### Post-1.0 Upgrade Roadmap
If the project receives donations, sponsorship, or organizational backing in the future:
1. **Priority 1: Apple Developer ID ($99/year)**
   macOS Gatekeeper is the most restrictive barrier for users because its default dialog suggests the application cannot be opened at all. Adding Apple notarization provides the highest UX return on investment.
2. **Priority 2: Azure Trusted Signing (~$10/month)**
   If an organization or verified identity is established, Azure Trusted Signing provides a cloud-native, modern signing solution for Windows without physical HSM tokens.

---

## Dormant CI Wiring & Secrets Runbook

The build workflow (`.github/workflows/build.yml`) contains dormant signing and notarization steps that automatically activate when the following repository secrets are configured. If the secrets are omitted or empty, the steps skip silently and release builds succeed unsigned.

### Enabling macOS Signing & Notarization
To enable macOS signing and notarization, add the following GitHub Actions secrets in **Repository Settings → Secrets and variables → Actions**:

1. `APPLE_CERTIFICATE`: Base64-encoded `.p12` certificate file.
   ```bash
   base64 -i DeveloperIDApplication.p12 | pbcopy
   ```
2. `APPLE_CERTIFICATE_PASSWORD`: Password used when exporting the `.p12` file.
3. `APPLE_SIGNING_IDENTITY`: (Optional) The identity string, e.g.:
   `Developer ID Application: Your Name (TEAM_ID)`
4. `APPLE_ID`: Your Apple Developer Apple ID email address.
5. `APPLE_PASSWORD`: An App-Specific Password generated from [appleid.apple.com](https://appleid.apple.com) (Security → App-Specific Passwords).
6. `APPLE_TEAM_ID`: Your 10-character Apple Developer Team ID (found in Developer Account Membership details).

Once these secrets are present, the macOS CI runner will automatically sign the application bundle, submit it to Apple Notary Service, wait for confirmation, and staple the ticket to the DMG installer.

### Enabling Windows Azure Trusted Signing
To enable Windows signing via Azure Trusted Signing:

1. `AZURE_TENANT_ID`: Azure Active Directory Tenant ID.
2. `AZURE_CLIENT_ID`: App Registration Client ID with Trusted Signing Certificate Profile Signer permissions.
3. `AZURE_CLIENT_SECRET`: App Registration Client Secret.
4. `AZURE_ACCOUNT_NAME`: Name of your Trusted Signing Account in Azure.
5. `AZURE_CERT_PROFILE_NAME`: Name of your Certificate Profile.
6. `AZURE_ENDPOINT`: (Optional, defaults to `https://eus.codesigning.azure.net`).

### Enabling Windows Authenticode (PFX) Signing
Alternatively, if you possess a traditional PFX code signing certificate:

1. `WINDOWS_CERTIFICATE`: Base64-encoded `.pfx` certificate file.
2. `WINDOWS_CERTIFICATE_PASSWORD`: Password protecting the `.pfx` certificate.

When configured, the CI workflow will sign all `.exe` and `.msi` installer bundles and refresh the updater signatures (`.sig`) using `pnpm tauri signer sign`.
