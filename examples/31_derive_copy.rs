#[derive(Copy)]
struct Point {
    x: i32,
    y: i32,
}

fn get_x(point: Point) -> i32 {
    point.x
}

fn main() -> i32 {
    let point = Point { x: 42, y: 7 };
    get_x(point)
}
