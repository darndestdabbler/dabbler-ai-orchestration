# Azure Virtual Desktop as a recording target — research, not a proposal

> **Status: research only, 2026-08-16**, done at the operator's request as
> Set 113 Session 4 closed:
>
> > *"One final option would be to fire up an Azure VDI desktop for
> > recording. We should just do some research on that now. My government
> > organization may want to consider it for a future capability."*
>
> **Nothing was built and no Azure resource was created.** This is desk
> research against vendor documentation, written down so the option is
> comparable to the other two rather than remembered as a good idea.
>
> Everything below is **unverified by measurement**. Set 113 Session 4's
> whole point was that a measured answer beats a reasoned one, and this is
> a reasoned one. Treat the two findings marked **VERIFY FIRST** as the
> things to settle before anyone spends money.

## Why this option exists at all

The operator's security framing (operator notes, 2026-08-16): a recorder
that works by capturing the screen is a facility for an AI-driven process
to read whatever is on the operator's display. Three ways to answer that:

| | Isolation from the operator's desktop | What gets recorded | Cost |
| :--- | :--- | :--- | :--- |
| **Host capture** (Session 4, today) | none — governed by the harness behaving well | **Windows** VS Code | free |
| **Container** (Session 5) | strong — the capability is removed, not governed | **Linux** VS Code | free, ~2–3 GB image |
| **Azure Virtual Desktop** | strong — a different machine entirely | **Windows** VS Code | Azure spend + tenant |

**The Azure option's distinctive value is the middle column.** AVD session
hosts run Windows, so a recording made there is a recording of the product
staff actually run. It buys the isolation *without* the fidelity cost the
container imposes — which is the one thing the operator has already agreed
to live with, and would then not have to.

## The two findings that decide it

### 1. VERIFY FIRST — AVD can be configured to block exactly this

This is the finding that most needs an administrator's attention, and it
is the reason to check before building.

Screen capture protection in AVD has **two modes**, and the difference is
precisely our use case:

- **Block screen capture on client** — *"prevents screen capture from the
  local device of applications running in the remote session."*
- **Block screen capture on client and server** — *"…but **also prevents
  tools and services within the virtual machine or Cloud PC capturing the
  screen**."*

A recorder running inside the session host is a "tool within the virtual
machine". Under the first mode it works; under the second it is **blocked
by design**. Microsoft's own verification steps say as much: *"if you
enabled Block screen capture on client and server …, try to capture the
screen using a tool or service within the virtual machine. The content is
blocked or hidden."*

For a government organisation this is not a hypothetical setting — screen
capture protection and watermarking are commonly enabled precisely to meet
compliance obligations, and the feature is available at no extra cost and
supports sovereign clouds. **So the first question is not technical, it is
a policy question for whoever owns that Group Policy / Intune setting**,
and the answer may simply be no.

There is a coherent position on the other side worth putting to them: a
**dedicated** session host used only for recording a throwaway fixture
project holds no sensitive data, so the control that protects real
workloads need not apply to it. That is an exemption request, not a
workaround, and it should be asked for in those terms.

### 2. AVD has no native session recording

There is no built-in "record this session" facility; organisations that
need it use third-party agents (Ekran/Syteca and similar) that run **inside**
the session host.

For this framework that is a mild positive rather than a negative: it
confirms that in-session recording is the normal architecture, and it means
our own recorder (OBS or otherwise, driven by the existing harness) is the
same shape as the commercial tools — no vendor dependency, no per-seat
licence.

## What else is known, and what is guessed

**Known from documentation:**

- Session hosts must run **Windows 11 22H2+ or Windows 10 22H2+** for the
  capture-protection settings to apply. AVD is a Windows product; there is
  no Linux session host. (For a Linux recording target you would use an
  ordinary Azure VM, not AVD — which then has the same fidelity trade as
  the container, without the container's zero cost.)
- **GPU-enabled session hosts exist** — NVv3, NVv4, NCasT4_v3, NVadsA10 v5
  — and a single A10 can be partitioned across up to six VMs. Enabling GPU
  acceleration is a documented configuration (hardware graphics adapters
  for all RDS sessions; H.264/AVC hardware encoding).
- Screen capture protection is **not DRM**; Microsoft says so explicitly
  and positions it as one control among several.

**Not established, and material to any decision:**

- **Cost.** Not researched. A GPU session host billed hourly is the obvious
  budget risk, and the operator's standing constraint on personal spend
  makes this the first number to get. Whether a **non-GPU** host suffices
  is the cheaper question to answer first — Electron and OBS both run
  without a GPU, more slowly, and a 50-second walkthrough is not a
  demanding workload.
- **Whether OBS's Windows Graphics Capture works over an RDP session
  host.** Session 4 measured WGC on physical hardware. A remote session's
  display stack is not the same thing, and `gdigrab` — the fallback —
  already black-framed a hardware-accelerated window locally. **This is the
  second VERIFY FIRST**: the capture path has to be measured on an actual
  session host before anyone concludes the option works at all.
- Whether the operator's tenant permits it, and under which sovereign
  cloud.

## What this does not change

**Session 5 is still the container**, and should not be redirected. The
container is free, local, needs no tenant, and answers the capability
question today. Azure is a *future capability* for an organisation that
already has the tenant and the compliance obligation — which is exactly how
the operator framed it.

The honest summary for that organisation: **AVD is the only one of the
three options that gives both isolation and Windows fidelity — and it is
also the only one that can be switched off by a policy someone else owns.**
Settle the two VERIFY FIRST items before spending anything.

## Sources

- [Screen capture protection in Azure Virtual Desktop — Microsoft Learn](https://learn.microsoft.com/en-us/azure/virtual-desktop/screen-capture-protection)
- [Enable GPU acceleration for Azure Virtual Desktop — Microsoft Learn](https://learn.microsoft.com/en-us/azure/virtual-desktop/graphics-enable-gpu-acceleration)
- [Security, governance, and compliance for Azure Virtual Desktop — Cloud Adoption Framework](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/scenarios/azure-virtual-desktop/eslz-security-governance-and-compliance)
- [Azure Virtual Desktop: Is there a recording session? — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1144800/azure-virtual-desktop-is-there-a-recording-session)
- [Announcing general availability of Screen Capture Protection for Azure Virtual Desktop — Microsoft Community Hub](https://techcommunity.microsoft.com/t5/azure-virtual-desktop/announcing-general-availability-of-screen-capture-protection-for/td-p/2699684)
- [Implementing Watermarking and Screen Capture Protection in Azure Virtual Desktop — CloudThat](https://www.cloudthat.com/resources/blog/implementing-watermarking-and-screen-capture-protection-in-azure-virtual-desktop)
