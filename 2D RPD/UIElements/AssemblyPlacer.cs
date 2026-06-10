using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class AssemblyPlacer : MonoBehaviour
{
	[SerializeField]
	RPDAssembly assemblyToPlace;

	[SerializeField]
	GenericTooth toothToPlaceOn;

	public void PlaceAssembly()
	{
		RPDManager.instance.PlaceAssembly(assemblyToPlace, toothToPlaceOn.ToothIndex);
	}
}
