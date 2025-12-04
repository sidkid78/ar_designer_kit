package com.ardesignerkit.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.ardesignerkit.plugins.arbridge.ARBridgePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register the ARBridge plugin before calling super
        registerPlugin(ARBridgePlugin::class.java)
        
        super.onCreate(savedInstanceState)
    }
}