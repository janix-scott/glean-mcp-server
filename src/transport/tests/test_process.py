import pytest
import asyncio
from ..process import ProcessTransport

@pytest.mark.asyncio
async def test_process_transport_initialization():
    transport = ProcessTransport()
    await transport.initialize()
    assert transport._process is not None
    assert transport._reader is not None
    assert transport._writer is not None
    transport.close()

@pytest.mark.asyncio
async def test_process_transport_write_read():
    transport = ProcessTransport()
    
    # Test writing data
    test_data = "test message\n"
    await transport.write(test_data)
    
    # Test reading response
    response = await transport.readline()
    assert response != ""  # Basic check that we got some response
    
    transport.close()

@pytest.mark.asyncio
async def test_process_transport_multiple_messages():
    transport = ProcessTransport()
    
    # Send multiple messages
    messages = ["message1\n", "message2\n", "message3\n"]
    for msg in messages:
        await transport.write(msg)
        response = await transport.readline()
        assert response != ""
    
    transport.close()

@pytest.mark.asyncio
async def test_process_transport_cleanup():
    transport = ProcessTransport()
    await transport.initialize()
    
    # Verify process is running
    assert transport._process is not None
    assert transport._process.poll() is None
    
    # Close transport
    transport.close()
    
    # Verify process was terminated
    assert transport._process is None 