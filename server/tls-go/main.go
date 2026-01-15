package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/signal"
	"runtime"
	"sync"
	"syscall"

	tls "github.com/refraction-networking/utls"
)

// ConnectRequest is sent by Node.js to establish a TLS connection
type ConnectRequest struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Fingerprint string `json:"fingerprint"`
}

// ConnectResponse is sent back to Node.js
type ConnectResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// Fingerprint configurations using utls ClientHelloIDs
var fingerprints = map[string]*tls.ClientHelloID{
	"chrome120":   &tls.HelloChrome_120,
	"chrome102":   &tls.HelloChrome_102,
	"chrome100":   &tls.HelloChrome_100,
	"firefox120":  &tls.HelloFirefox_120,
	"firefox105":  &tls.HelloFirefox_105,
	"firefox102":  &tls.HelloFirefox_102,
	"safari16":    &tls.HelloSafari_16_0,
	"edge106":     &tls.HelloEdge_106,
	"edge85":      &tls.HelloEdge_85,
	"ios14":       &tls.HelloIOS_14,
	"android11":   &tls.HelloAndroid_11_OkHttp,
	"electron":    &tls.HelloChrome_120, // Electron uses Chromium
	"randomized":  &tls.HelloRandomized,
	"golanghttp2": &tls.HelloGolang,
}

func main() {
	// Get socket path from args or use default
	socketPath := "/tmp/claudio-tls.sock"
	if len(os.Args) > 1 {
		socketPath = os.Args[1]
	}

	// Remove existing socket file
	os.Remove(socketPath)

	// Create listener
	var listener net.Listener
	var err error

	if runtime.GOOS == "windows" {
		// Windows doesn't support Unix sockets well, use TCP
		listener, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to listen: %v\n", err)
			os.Exit(1)
		}
		// Print the port for Node.js to connect
		fmt.Printf("LISTEN:%s\n", listener.Addr().String())
	} else {
		listener, err = net.Listen("unix", socketPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to listen on %s: %v\n", socketPath, err)
			os.Exit(1)
		}
		// Set permissions so Node.js can connect
		os.Chmod(socketPath, 0666)
		fmt.Printf("LISTEN:%s\n", socketPath)
	}

	// Signal that we're ready
	fmt.Println("READY")
	os.Stdout.Sync()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		fmt.Fprintln(os.Stderr, "Shutting down...")
		listener.Close()
		if runtime.GOOS != "windows" {
			os.Remove(socketPath)
		}
		os.Exit(0)
	}()

	// Accept connections
	for {
		conn, err := listener.Accept()
		if err != nil {
			// Check if listener was closed
			if opErr, ok := err.(*net.OpError); ok && opErr.Err.Error() == "use of closed network connection" {
				break
			}
			fmt.Fprintf(os.Stderr, "Accept error: %v\n", err)
			continue
		}
		go handleConnection(conn)
	}
}

func handleConnection(clientConn net.Conn) {
	defer clientConn.Close()

	reader := bufio.NewReader(clientConn)

	// Read the connect request as a single line of JSON (newline-delimited)
	line, err := reader.ReadBytes('\n')
	if err != nil {
		sendErrorLine(clientConn, "Failed to read request: "+err.Error())
		return
	}

	var req ConnectRequest
	if err := json.Unmarshal(line, &req); err != nil {
		sendErrorLine(clientConn, "Invalid JSON: "+err.Error())
		return
	}

	// Get fingerprint
	helloID, ok := fingerprints[req.Fingerprint]
	if !ok {
		helloID = &tls.HelloChrome_120 // Default to Chrome
	}

	// Connect to target
	targetAddr := fmt.Sprintf("%s:%d", req.Host, req.Port)
	tcpConn, err := net.Dial("tcp", targetAddr)
	if err != nil {
		sendErrorLine(clientConn, "Failed to connect to target: "+err.Error())
		return
	}

	// Create TLS connection with custom fingerprint
	tlsConfig := &tls.Config{
		ServerName:         req.Host,
		InsecureSkipVerify: true,
	}

	// Use HelloCustom with our own spec that forces HTTP/1.1
	tlsConn := tls.UClient(tcpConn, tlsConfig, tls.HelloCustom)

	// Get the base spec from the original hello ID
	baseSpec, err := tls.UTLSIdToSpec(*helloID)
	if err != nil {
		tcpConn.Close()
		sendErrorLine(clientConn, "Failed to get TLS spec: "+err.Error())
		return
	}

	// Modify ALPN to HTTP/1.1 only (to avoid HTTP/2 complexity)
	for i, ext := range baseSpec.Extensions {
		if _, ok := ext.(*tls.ALPNExtension); ok {
			baseSpec.Extensions[i] = &tls.ALPNExtension{
				AlpnProtocols: []string{"http/1.1"},
			}
			break
		}
	}

	// Apply the modified spec
	if err := tlsConn.ApplyPreset(&baseSpec); err != nil {
		tcpConn.Close()
		sendErrorLine(clientConn, "Failed to apply TLS spec: "+err.Error())
		return
	}

	// Perform TLS handshake
	if err := tlsConn.Handshake(); err != nil {
		tcpConn.Close()
		sendErrorLine(clientConn, "TLS handshake failed: "+err.Error())
		return
	}

	// Send success response (newline-delimited JSON)
	sendSuccessLine(clientConn)

	// Now proxy data bidirectionally (raw bytes, no framing)
	var wg sync.WaitGroup
	wg.Add(2)

	// Client -> Target (use reader to get any buffered data after the request line)
	go func() {
		defer wg.Done()
		io.Copy(tlsConn, reader)
		tlsConn.CloseWrite()
	}()

	// Target -> Client (raw bytes)
	go func() {
		defer wg.Done()
		io.Copy(clientConn, tlsConn)
	}()

	wg.Wait()
	tlsConn.Close()
}

func sendErrorLine(conn net.Conn, errMsg string) {
	resp := ConnectResponse{Success: false, Error: errMsg}
	data, _ := json.Marshal(resp)
	conn.Write(append(data, '\n'))
}

func sendSuccessLine(conn net.Conn) {
	resp := ConnectResponse{Success: true}
	data, _ := json.Marshal(resp)
	conn.Write(append(data, '\n'))
}
