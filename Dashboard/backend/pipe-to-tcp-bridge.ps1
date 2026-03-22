param(
    [string]$PipeName = "SHTelemetry",
    [string]$TcpHost = "127.0.0.1",
    [int]$TcpPort = 9000
)

$FullPipeName = "\\.\pipe\$PipeName"
$tcpClient = $null
$tcpStream = $null
$pipeStream = $null

Write-Host "Named Pipe to TCP Bridge"
Write-Host "Pipe: $FullPipeName"
Write-Host "TCP: $TcpHost`:$TcpPort"

while ($true) {
    # Connect to Named Pipe
    if ($null -eq $pipeStream) {
        try {
            $pipeStream = New-Object System.IO.Pipes.NamedPipeClientStream(".", $PipeName, [System.IO.Pipes.PipeDirection]::In)
            $pipeStream.Connect(5000)
            Write-Host "[OK] Pipe connected"
        }
        catch {
            Write-Host "[WAIT] Pipe unavailable, retry in 3s..."
            Start-Sleep -Seconds 3
            $pipeStream = $null
            continue
        }
    }

    # Connect to TCP
    if ($null -eq $tcpClient) {
        try {
            $tcpClient = New-Object System.Net.Sockets.TcpClient
            $tcpClient.Connect($TcpHost, $TcpPort)
            $tcpStream = $tcpClient.GetStream()
            Write-Host "[OK] TCP connected"
        }
        catch {
            Write-Host "[ERROR] TCP: $_"
            $tcpClient = $null
            $tcpStream = $null
            Start-Sleep -Seconds 3
            continue
        }
    }

    # Read from Pipe
    try {
        $reader = New-Object System.IO.StreamReader($pipeStream)
        
        while ($pipeStream.IsConnected -and $tcpStream.CanWrite) {
            $line = $reader.ReadLine()
            
            if ($null -ne $line) {
                Write-Host "[>] Data received"
                
                # Send to TCP
                try {
                    $bytes = [Text.Encoding]::UTF8.GetBytes($line + "`n")
                    $tcpStream.Write($bytes, 0, $bytes.Length)
                    $tcpStream.Flush()
                    Write-Host "[OK] Sent"
                }
                catch {
                    Write-Host "[ERROR] Send failed: $_"
                    $tcpClient = $null
                    $tcpStream = $null
                    break
                }
            }
            
            Start-Sleep -Milliseconds 10
        }
        
        $reader.Dispose()
    }
    catch {
        Write-Host "[ERROR] Pipe error: $_"
    }

    # Cleanup
    if ($null -ne $tcpStream) {
        $tcpStream.Dispose()
    }
    if ($null -ne $tcpClient) {
        $tcpClient.Close()
    }
    
    $tcpClient = $null
    $tcpStream = $null
    $pipeStream = $null
    
    Write-Host "[RETRY] Reconnecting in 3 seconds..."
    Start-Sleep -Seconds 3
}
