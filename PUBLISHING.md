# Publishing Forerunner to Maven Central

This repository is multi-module. The published Maven artifact
`biz.digitalindustry.workflow:forerunner` is produced by the `core` module,
which is configured with Gradle `maven-publish` and `signing`.

## Required Credentials

Provide these as Gradle properties (`~/.gradle/gradle.properties`) or env vars:

- `sonatypeUsername` or `SONATYPE_USERNAME`
- `sonatypePassword` or `SONATYPE_PASSWORD`
- `signingKey` or `SIGNING_KEY` (ASCII-armored private key)
- `signingPassword` or `SIGNING_PASSWORD`

Example `~/.gradle/gradle.properties`:

```properties
sonatypeUsername=YOUR_SONATYPE_USERNAME
sonatypePassword=YOUR_SONATYPE_PASSWORD
signingKey=-----BEGIN PGP PRIVATE KEY BLOCK-----...-----END PGP PRIVATE KEY BLOCK-----
signingPassword=YOUR_PGP_PASSPHRASE
```

## Release Process

1. Ensure `version` in `build.gradle.kts` is a release version (not `-SNAPSHOT`).
2. Build and test:

```bash
./gradlew clean build
```

3. Publish signed artifacts to Sonatype:

```bash
./gradlew :core:publish
```

4. Close/release staging repository in Sonatype (if required by your account flow).

## Snapshot Publishing

If `version` ends with `-SNAPSHOT`, artifacts publish to Sonatype snapshots.
