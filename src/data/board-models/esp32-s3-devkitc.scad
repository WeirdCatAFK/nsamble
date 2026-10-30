$fn = 32;
pcb_w = 69.2; pcb_h = 25.5; pcb_t = 1.0;

// PCB
color("green") cube([pcb_w, pcb_h, pcb_t]);

// Pin headers: 2x 20-pin along long edges
color([0.2,0.2,0.2]) {
    translate([1.27, 0, pcb_t]) cube([20*2.54, 2.54, 8.5]);
    translate([1.27, pcb_h-2.54, pcb_t]) cube([20*2.54, 2.54, 8.5]);
}

// USB-C connector
color("silver") translate([-1.5, (pcb_h-9)/2, pcb_t]) cube([7, 9, 3.5]);

// ESP32-S3-WROOM module
color("silver") translate([pcb_w-25.5-2.0, (pcb_h-18)/2, pcb_t]) cube([25.5, 18, 3.2]);

// Antenna area
color([0.9,0.85,0.7]) translate([pcb_w-7.0, (pcb_h-14)/2, pcb_t+3.2]) cube([5.0, 14, 0.3]);

// Reset + Boot buttons
color([0.3,0.3,0.3]) {
    translate([6.0, 3.5, pcb_t]) cylinder(d=3.5, h=2.0);
    translate([6.0, pcb_h-3.5, pcb_t]) cylinder(d=3.5, h=2.0);
}
