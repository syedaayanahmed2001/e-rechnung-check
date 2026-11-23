# Third-party notices

E-Rechnung-Check's own code is MIT-licensed (see `LICENSE`). The components below are not part of
that licence. Unless noted otherwise, they are **not committed** to this repository: they are
downloaded from their official releases, pinned by SHA-256 (`scripts/rules/artefacts.json`), and
used unchanged.

| Component | Version | Used for | Licence | Where it comes from |
|---|---|---|---|---|
| KoSIT Validator Configuration XRechnung | 3.0.2, release 2026-08-31 | Official scenarios, Schematron XSLT, XSD (Check) | Apache-2.0 (KoSIT) | github.com/itplr-kosit/validator-configuration-xrechnung |
| ↳ EN 16931 validation artefacts (CEN Schematron) | 1.3.16 | EN 16931 rules (inside the configuration) | EUPL-1.2 | github.com/ConnectingEurope/eInvoicing-EN16931 |
| ↳ XRechnung Schematron | 2.6.0 | XRechnung rules (inside the configuration) | Apache-2.0 | github.com/itplr-kosit/xrechnung-schematron |
| ↳ OASIS UBL 2.1 XML Schemas | 2.1 | UBL XSD (inside the configuration) | © OASIS Open 2013, OASIS IPR policy (copying and distribution permitted) | docs.oasis-open.org/ubl/os-UBL-2.1 |
| ↳ UN/CEFACT Cross Industry Invoice schemas | D16B | CII XSD (inside the configuration) | © UN/CEFACT 2016; may be copied and distributed with the copyright notice | unece.org |
| KoSIT XRechnung Test Suite | 3.0.2, 2026-08-31 | Parity corpus and test inputs (source of the generated mutations) | Apache-2.0 | github.com/itplr-kosit/xrechnung-testsuite |
| KoSIT Validator (Java) | 1.6.3 | Reference implementation in the CI parity job only | Apache-2.0 | github.com/itplr-kosit/validator |
| ZUGFeRD corpus (XML-Rechnung folder) | commit 02d4b568 | Optional extra parity and eval corpus, fetched by `npm run corpus:external`, never committed | Apache-2.0 (repository licence). The PDFs carry "(c) FeRD 2022" and are derived from AWV/FeRD's public ZUGFeRD samples, so recordings made from them stay local | github.com/ZUGFeRD/corpus |
| **SaxonJS** | 2.7 (npm `saxon-js`, `xslt3`; browser build `SaxonJS2.js`) | XSLT 3.0 / XPath 3.1 engine that runs the official rules | **Saxonica SaxonJS public licence v1.0: free of charge, not open source.** Redistributed here in unmodified binary form as part of this application, as that licence permits (full text below) | saxonica.com, npm |
| libxml2-wasm | 0.7.x | Well-formedness and XML Schema validation (WebAssembly) | MIT (includes libxml2, MIT) | npm |
| pdf-lib | 1.17.x | Reading embedded files from PDFs, generating synthetic PDFs | MIT | npm |
| pdf.js (`pdfjs-dist`) | 6.x | PDF text layer in the browser (Convert) | Apache-2.0 | npm |
| fflate, @xmldom/xmldom, zod | | Unzip, XML DOM for config and report parsing, schema | MIT | npm |
| Next.js, React, Tailwind CSS | | Web app | MIT | npm |
| Python: pydantic, pypdf, defusedxml, httpx | | Eval | MIT / BSD-3-Clause / PSF / BSD-3-Clause | PyPI |

## Models (Convert; called at runtime, not distributed)

| Model | Where | Licence |
|---|---|---|
| openai/gpt-oss-120b | Groq free tier (demo mode, text) | Apache-2.0 open weights |
| qwen/qwen3.8-27b | Groq free tier (demo mode, images; a Groq preview model) | Apache-2.0 open weights |
| qwen3:4b | Ollama, local (private mode, text) | Apache-2.0 open weights |
| granite3.2-vision:2b | Ollama, local (private mode, images) | Apache-2.0 open weights |

## SaxonJS licence (reproduced as required by its condition 1)

```
      Version 1.0, June 2020
      
      Software: This license applies to the packages "xslt3" and "saxon-js"
      distributed via npm (https://www.npmjs.com) and to the modules SaxonJS2.js
      and SaxonJS2.rt.js available for download from the Saxonica web site
      (https://www.saxonica.com/).
      
      Copyright: The copyright in the Software belongs to Saxonica Ltd, except
      for third-party components listed in the documentation that are distributed
      under license.
      
      Binary form: In this license, "binary form" means the form in which the
      Software is issued (this is technically a set of obfuscated Javascript files).
      
      Deployment and use. The Software may be copied to any computer where the
      primary purpose is the execution of the software on that computer, or on
      connected client computers.
      
      Redistribution.  Redistribution in binary form, without
      modification, is permitted as part of an application that makes use
      of the Software, provided that the following conditions are
      met:
      
      1) Redistributions must reproduce the above copyright notice and the
      following disclaimer in the documentation and/or other materials
      provided with the distribution.
      
      2) Except to the extent explicitly permitted by law, no reverse
      engineering, decompilation, or disassembly of this software is
      permitted.
      
      3) Neither the name of the copyright holder nor the names of its
      contributors may be used to endorse or promote products derived from
      this software without specific prior written permission.
      
      4) Copying the software to a site whose primary purpose is to make
      it available to third parties is not permitted without specific
      prior written permission.
      
      If you institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the software
      itself infringes your patent(s), then your rights granted under this
      license shall terminate as of the date such litigation is filed.
      
      DISCLAIMER. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND
      CONTRIBUTORS "AS IS." ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT
      NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
      FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
      HOLDERS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
      SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
      TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
      PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
      LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
      NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
      SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
