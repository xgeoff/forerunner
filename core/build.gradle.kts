import java.util.Base64
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm")
    `java-library`
    `maven-publish`
    signing
}

dependencies {
    api(project(":model"))
    api(project(":dsl-kotlin"))
    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(17)
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

java {
    withSourcesJar()
    withJavadocJar()
}

tasks.test {
    useJUnitPlatform()
}

publishing {
    publications {
        create<MavenPublication>("mavenJava") {
            artifactId = "forerunner"
            from(components["java"])

            pom {
                name.set("forerunner")
                description.set(rootProject.description)
                url.set("https://github.com/digitalindustry/forerunner")

                licenses {
                    license {
                        name.set("MIT License")
                        url.set("https://opensource.org/license/mit")
                    }
                }

                developers {
                    developer {
                        id.set("forerunner-contributors")
                        name.set("Forerunner Project Contributors")
                    }
                }

                scm {
                    connection.set("scm:git:git://github.com/digitalindustry/forerunner.git")
                    developerConnection.set("scm:git:ssh://github.com:digitalindustry/forerunner.git")
                    url.set("https://github.com/digitalindustry/forerunner")
                }
            }
        }
    }
}

signing {
    val signingKeyId =
        (findProperty("signing.keyIdHex") as String?)
            ?: (findProperty("signing.keyId") as String?)
            ?: (findProperty("signingKeyId") as String?)
            ?: System.getenv("SIGNING_KEY_ID_HEX")
            ?: System.getenv("SIGNING_KEY_ID")

    val signingPassword =
        (findProperty("signing.password") as String?)
            ?: (findProperty("signingPassword") as String?)
            ?: System.getenv("SIGNING_PASSWORD")

    val signingKey =
        (findProperty("signingKey") as String?)
            ?: (findProperty("signing.key") as String?)
            ?: System.getenv("SIGNING_KEY")

    val signingSecretKeyRingFileBase64 =
        (findProperty("signing.secretKeyRingFileBase64") as String?)
            ?: System.getenv("SIGNING_SECRET_KEY_RING_FILE_BASE64")

    val decodedSigningKey =
        if (!signingKey.isNullOrBlank()) {
            signingKey
        } else if (!signingSecretKeyRingFileBase64.isNullOrBlank()) {
            String(Base64.getDecoder().decode(signingSecretKeyRingFileBase64))
        } else {
            null
        }

    if (!decodedSigningKey.isNullOrBlank() && !signingPassword.isNullOrBlank()) {
        if (!signingKeyId.isNullOrBlank()) {
            useInMemoryPgpKeys(signingKeyId, decodedSigningKey, signingPassword)
        } else {
            useInMemoryPgpKeys(decodedSigningKey, signingPassword)
        }
        sign(publishing.publications)
    }
}
