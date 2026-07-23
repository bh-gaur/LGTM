import sys
import os
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.obs import trace, logger

print("OTel initialization checked.")
tracer = trace.get_tracer("test-tracer")

with tracer.start_as_current_span("TestPythonSpan") as span:
    span.set_attribute("test.property", "hello-world")
    print("Span created. Flushing trace provider...")

time.sleep(2)
print("Finished.")
