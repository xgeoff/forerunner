plugins {
    kotlin("jvm")
}

dependencies {
    implementation(project(":workflow-engine"))
    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(21)
}

tasks.test {
    useJUnitPlatform()
}
