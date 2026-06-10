using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Constants;

[System.Serializable]
public class SpriteData
{
	public Sprite sprite;
	public Color color;
	public float width;
	public float height;
	public Vector3 positionOffset = Vector3.zero;
	public Vector3 rotationOffset = Vector3.zero;
	public Vector3 scale = Vector3.one;

	public List<int> toothFDIID = new List<int>();

	public Enums.VisualsDirectionTag direction = Enums.VisualsDirectionTag.None;
	public Enums.VisualsMaterialTag material = Enums.VisualsMaterialTag.None;
	public Enums.VisualsPositionTag position = Enums.VisualsPositionTag.None;
}
