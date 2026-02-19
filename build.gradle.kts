plugins {
    kotlin("jvm") version "2.0.21"
}

group = "biz.digitalindustry.workflow"
version = "0.2.0"

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(21)
}

tasks.test {
    useJUnitPlatform()
}
