buildscript {
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath("biz.digitalindustry:grimoire:0.3.0")
    }
}

plugins {
    kotlin("jvm") version "2.0.21" apply false
    id("io.github.gradle-nexus.publish-plugin") version "2.0.0"
}

apply(plugin = "biz.digitalindustry.grimoire")

group = "biz.digitalindustry.workflow"
version = "0.4.0"

description = "Forerunner - a deterministic Kotlin workflow engine"

subprojects {
    group = rootProject.group
    version = rootProject.version

    repositories {
        mavenCentral()
    }
}

nexusPublishing {
    packageGroup.set(group.toString())

    repositories {
        sonatype {
            nexusUrl.set(uri("https://ossrh-staging-api.central.sonatype.com/service/local/"))
            snapshotRepositoryUrl.set(uri("https://central.sonatype.com/repository/maven-snapshots/"))

            username.set(
                (findProperty("sonatypeUsername") as String?)
                    ?: (findProperty("sonatypePublisherTokenName") as String?)
                    ?: System.getenv("SONATYPE_USERNAME")
                    ?: System.getenv("SONATYPE_PUBLISHER_TOKEN_NAME")
            )
            password.set(
                (findProperty("sonatypePassword") as String?)
                    ?: (findProperty("sonatypePublisherTokenPassword") as String?)
                    ?: System.getenv("SONATYPE_PASSWORD")
                    ?: System.getenv("SONATYPE_PUBLISHER_TOKEN_PASSWORD")
            )
        }
    }
}
